// Generates a shareable poster image for a post — the thing people send to
// their Instagram story instead of a bare link. Everything is drawn into a
// canvas in the browser (no server, no build step), then handed to the native
// share sheet via the Web Share API, with a download fallback on desktop.
//
// Three backdrops: the post's own photo blown up and blurred behind itself,
// solid black, or the light editorial treatment.

const CARD_FORMATS = {
  story: { w: 1080, h: 1920, label: "Story" },   // 9:16, full-screen story
  post:  { w: 1080, h: 1350, label: "Post" }     // 4:5, tallest the IG feed allows
};

const CARD_PAD = 40;
const CARD_TYPE = "image/jpeg";
const CARD_QUALITY = 0.94;
const CARD_BRAND = "Glares";
const CARD_SLOGAN = "Taste, on request";
const CARD_FOOTER_H = 96;

const SHARE_BACKGROUNDS = ["liquid", "black", "white"];

// The feed-post size exists for promoting the site, so it's offered to this
// account only. Gated on the username rather than the is_admin flag because
// there is more than one admin.
const POSTER_FORMAT_ACCOUNT = "elvanmire";

// Canvas can only use a font weight the browser has actually downloaded.
// Google Fonts serves each weight as its own file and only fetches the ones
// the page already renders, so ask for these explicitly before drawing —
// otherwise the card silently falls back to a default sans and looks wrong.
async function ensureCardFonts() {
  if (!document.fonts) return;
  const needed = [
    "800 104px Inter",
    "700 48px Inter",
    "500 34px Inter",
    "600 26px 'IBM Plex Mono'",
    "600 56px 'Cormorant Garamond'"
  ];
  try {
    await Promise.all(needed.map(f => document.fonts.load(f)));
    await document.fonts.ready;
  } catch (_) {
    // A font that fails to load isn't worth failing the whole card over.
  }
}

// Keyed by URL so switching backgrounds or formats re-renders instantly
// instead of re-downloading a multi-megabyte photo each time.
const cardImageCache = new Map();

function loadCardImage(src) {
  if (cardImageCache.has(src)) return cardImageCache.get(src);
  const promise = new Promise((resolve, reject) => {
    const img = new Image();
    // Required so the canvas isn't tainted and toBlob() still works.
    // Supabase storage serves public objects with access-control-allow-origin: *.
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't load that image"));
    img.src = src;
  });
  cardImageCache.set(src, promise);
  return promise;
}

// Source rect for a centre "cover" crop at a given zoom.
function coverCrop(img, targetRatio, zoom) {
  const srcRatio = img.naturalWidth / img.naturalHeight;
  let sw, sh;
  if (srcRatio > targetRatio) {
    sh = img.naturalHeight / zoom;
    sw = sh * targetRatio;
  } else {
    sw = img.naturalWidth / zoom;
    sh = sw / targetRatio;
  }
  return {
    sx: (img.naturalWidth - sw) / 2,
    sy: (img.naturalHeight - sh) / 2,
    sw,
    sh
  };
}

// The photo, zoomed in and blurred out, filling the whole card behind itself.
//
// The blur comes from drawing the photo down to a tiny canvas and then
// blowing it back up — the browser's own bilinear smoothing does the work.
// ctx.filter would be tidier but Safari only got it in 17.4, and this needs
// to work on whatever phone someone opens Instagram with.
function drawLiquidBackdrop(ctx, img, W, H) {
  const small = document.createElement("canvas");
  small.width = 42;
  small.height = Math.max(1, Math.round(42 * (H / W)));
  const sctx = small.getContext("2d");
  const { sx, sy, sw, sh } = coverCrop(img, small.width / small.height, 1.6);
  sctx.drawImage(img, sx, sy, sw, sh, 0, 0, small.width, small.height);

  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  try { ctx.filter = "saturate(1.45)"; } catch (_) {}
  ctx.drawImage(small, 0, 0, W, H);
  ctx.restore();

  // Scrim: without it, white type lands on whatever brightness the photo
  // happened to have there and becomes unreadable.
  const scrim = ctx.createLinearGradient(0, 0, 0, H);
  scrim.addColorStop(0, "rgba(6,6,8,0.52)");
  scrim.addColorStop(0.45, "rgba(6,6,8,0.40)");
  scrim.addColorStop(1, "rgba(6,6,8,0.82)");
  ctx.fillStyle = scrim;
  ctx.fillRect(0, 0, W, H);
}

function roundRectPath(ctx, x, y, w, h, radius) {
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
    return;
  }
  // Safari before 16.4 has no roundRect.
  const r = Math.min(radius, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapLines(ctx, text, maxWidth) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (!line || ctx.measureText(candidate).width <= maxWidth) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// Shrink the title until it fits the line budget — short names come out big
// and loud, long ones keep stepping down rather than getting cut off. The
// ramp runs well below the sizes a short name would ever use, so a genuinely
// long name ends up small instead of truncated.
const TITLE_SIZES = [112, 104, 96, 88, 80, 72, 64, 56, 48, 42, 36, 32, 28];

function fitTitle(ctx, text, maxWidth, maxLines, maxSize) {
  const ramp = TITLE_SIZES.filter(s => s <= (maxSize || TITLE_SIZES[0]));
  for (const size of ramp) {
    ctx.font = `800 ${size}px Inter, sans-serif`;
    const lines = wrapLines(ctx, text, maxWidth);
    if (lines.length <= maxLines) return { size, lines };
  }
  const size = ramp[ramp.length - 1];
  ctx.font = `800 ${size}px Inter, sans-serif`;
  const lines = wrapLines(ctx, text, maxWidth).slice(0, maxLines);
  if (lines.length) {
    let last = lines[lines.length - 1];
    while (last.length > 1 && ctx.measureText(`${last}...`).width > maxWidth) {
      last = last.slice(0, -1);
    }
    lines[lines.length - 1] = `${last}...`;
  }
  return { size, lines };
}

function drawTagPill(ctx, text, x, y, theme) {
  ctx.font = "600 26px 'IBM Plex Mono', monospace";
  const label = String(text).toUpperCase();
  const textW = ctx.measureText(label).width;
  const padX = 26;
  const h = 52;
  const w = textW + padX * 2;
  ctx.fillStyle = theme.pillBg;
  roundRectPath(ctx, x, y, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = theme.pillInk;
  ctx.textBaseline = "middle";
  ctx.fillText(label, x + padX, y + h / 2 + 1);
  ctx.textBaseline = "alphabetic";
  return w;
}

function themeFor(background) {
  if (background === "white") {
    return {
      ink: "#111111",
      soft: "#6B6B68",
      pillBg: "rgba(17,17,17,0.08)",
      pillInk: "rgba(17,17,17,0.72)"
    };
  }
  return {
    ink: "#FFFFFF",
    soft: "rgba(255,255,255,0.66)",
    pillBg: "rgba(255,255,255,0.18)",
    pillInk: "rgba(255,255,255,0.94)"
  };
}

/**
 * Draws the poster and returns it as a Blob.
 * post: { title, budget, category, image_url, username }
 * background: "liquid" | "black" | "white"
 * format: "story" (9:16) | "post" (4:5, Instagram feed)
 */
async function buildShareCard(post, { background = "liquid", format = "story" } = {}) {
  await ensureCardFonts();

  const { w: W, h: H } = CARD_FORMATS[format] || CARD_FORMATS.story;

  let img = null;
  if (post.image_url) {
    try {
      img = await loadCardImage(post.image_url);
    } catch (_) {
      img = null;   // fall through to a plain backdrop
    }
  }
  // "liquid" needs a photo to blur; without one it's just a flat colour.
  if (background === "liquid" && !img) background = "white";

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  const contentW = W - CARD_PAD * 2;
  const theme = themeFor(background);

  // ---- backdrop ----
  if (background === "liquid") {
    drawLiquidBackdrop(ctx, img, W, H);
  } else if (background === "black") {
    ctx.fillStyle = "#08080A";
    ctx.fillRect(0, 0, W, H);
  } else {
    ctx.fillStyle = "#FAFAF8";
    ctx.fillRect(0, 0, W, H);
  }

  // ---- layout ----
  // The footer row is fixed height: brand and slogan on the left, price and
  // who asked on the right, both sitting on the same baseline.
  const topLimit = Math.round(H * 0.037);
  const footerBottom = H - CARD_PAD;
  const bottomLimit = H - CARD_PAD - CARD_FOOTER_H - 34;

  const maxTitleLines = img ? 3 : 6;
  // The 4:5 card has far less height to spend, so it starts the title ramp
  // lower — otherwise a big title would squeeze the photo down to nothing.
  const maxTitleSize = format === "post" ? 88 : 112;

  const title = fitTitle(ctx, post.title || "Untitled", contentW, maxTitleLines, maxTitleSize);
  const titleLineH = Math.round(title.size * 1.08);
  const titleH = title.lines.length * titleLineH;

  const hasTag = Boolean(post.category);
  const hasBudget = Boolean(post.budget);
  const hasAuthor = Boolean(post.username);

  const GAP_ART = 40;
  const GAP_TAG = 20;

  let textH = titleH;
  if (hasTag) textH += 52 + GAP_TAG;

  let artW = 0, artH = 0;
  if (img) {
    const available = bottomLimit - topLimit - textH - GAP_ART;
    const maxArtH = Math.max(300, Math.min(Math.round(H * 0.76), available));
    const scale = Math.min(contentW / img.naturalWidth, maxArtH / img.naturalHeight);
    artW = Math.round(img.naturalWidth * scale);
    artH = Math.round(img.naturalHeight * scale);
  }

  // Photo first, title tucked underneath. Biased upward so any slack falls
  // between the title and the footer rather than above the photo. A
  // text-only card has no photo to lead with, so it sits nearer the middle
  // instead of stranding the title at the top of an empty page.
  const blockH = (img ? artH + GAP_ART : 0) + textH;
  const bias = img ? 0.3 : 0.42;
  let y = Math.max(topLimit, topLimit + (bottomLimit - topLimit - blockH) * bias);

  // ---- artwork ----
  if (img) {
    const artX = Math.round((W - artW) / 2);
    ctx.save();
    ctx.shadowColor = background === "white" ? "rgba(17,17,17,0.22)" : "rgba(0,0,0,0.55)";
    ctx.shadowBlur = 70;
    ctx.shadowOffsetY = 26;
    roundRectPath(ctx, artX, y, artW, artH, 34);
    ctx.fillStyle = "#000";
    ctx.fill();
    ctx.restore();

    ctx.save();
    roundRectPath(ctx, artX, y, artW, artH, 34);
    ctx.clip();
    ctx.drawImage(img, artX, y, artW, artH);
    ctx.restore();

    y += artH + GAP_ART;
  }

  // ---- tag ----
  if (hasTag) {
    drawTagPill(ctx, post.category, CARD_PAD, y, theme);
    y += 52 + GAP_TAG;
  }

  // ---- title ----
  ctx.fillStyle = theme.ink;
  ctx.font = `800 ${title.size}px Inter, sans-serif`;
  for (const line of title.lines) {
    y += titleLineH;
    ctx.fillText(line, CARD_PAD, y - Math.round(titleLineH * 0.2));
  }

  // ---- footer left: brand + slogan ----
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = theme.soft;
  ctx.font = "500 26px 'IBM Plex Mono', monospace";
  ctx.fillText(CARD_SLOGAN, CARD_PAD, footerBottom);
  ctx.fillStyle = theme.ink;
  ctx.font = "600 56px 'Cormorant Garamond', serif";
  ctx.fillText(CARD_BRAND, CARD_PAD, footerBottom - 38);

  // ---- footer right: price + who asked ----
  ctx.textAlign = "right";
  if (hasAuthor) {
    ctx.fillStyle = theme.soft;
    ctx.font = "500 34px Inter, sans-serif";
    ctx.fillText(`asked by ${post.username}`, W - CARD_PAD, footerBottom);
  }
  if (hasBudget) {
    ctx.fillStyle = theme.ink;
    ctx.font = "700 48px Inter, sans-serif";
    ctx.fillText(post.budget, W - CARD_PAD, footerBottom - (hasAuthor ? 46 : 0));
  }
  ctx.textAlign = "left";

  return new Promise(resolve => canvas.toBlob(resolve, CARD_TYPE, CARD_QUALITY));
}

function shareCardFileName(post, format = "story") {
  const base = String(post.title || "glares-post")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "glares-post";
  return `glares-${base}-${format}.jpg`;
}

// Opens the native share sheet when the browser supports sharing files
// (every current mobile browser does — that's the Instagram-story path).
// Desktop browsers mostly don't, so they get the image to save instead.
async function shareOrDownloadCard(post, blob, format = "story") {
  const file = new File([blob], shareCardFileName(post, format), { type: CARD_TYPE });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: post.title || CARD_BRAND });
      return "shared";
    } catch (err) {
      if (err && err.name === "AbortError") return "cancelled";
      // Anything else falls through to the download path below.
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return "downloaded";
}
