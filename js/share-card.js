// Generates a shareable poster image for a post — the thing people send to
// their Instagram story instead of a bare link. Everything is drawn into a
// canvas in the browser (no server, no build step), then handed to the native
// share sheet via the Web Share API, with a download fallback on desktop.
//
// Three backdrops: the post's own photo blown up and blurred behind itself,
// solid black, or Esven's off-white.

const CARD_W = 1080;
const CARD_H = 1920;          // 9:16 — Instagram/TikTok story shape
const CARD_PAD = 56;
const CARD_TYPE = "image/jpeg";
const CARD_QUALITY = 0.94;
const CARD_TAGLINE = "real people living in the real world";

const SHARE_BACKGROUNDS = ["liquid", "black", "white"];

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

// Keyed by URL so switching backgrounds re-renders instantly instead of
// re-downloading a multi-megabyte photo each time.
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
function drawLiquidBackdrop(ctx, img) {
  const small = document.createElement("canvas");
  small.width = 42;
  small.height = 74;
  const sctx = small.getContext("2d");
  const { sx, sy, sw, sh } = coverCrop(img, small.width / small.height, 1.6);
  sctx.drawImage(img, sx, sy, sw, sh, 0, 0, small.width, small.height);

  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  try { ctx.filter = "saturate(1.45)"; } catch (_) {}
  ctx.drawImage(small, 0, 0, CARD_W, CARD_H);
  ctx.restore();

  // Scrim: without it, white type lands on whatever brightness the photo
  // happened to have there and becomes unreadable.
  const scrim = ctx.createLinearGradient(0, 0, 0, CARD_H);
  scrim.addColorStop(0, "rgba(6,6,8,0.52)");
  scrim.addColorStop(0.45, "rgba(6,6,8,0.40)");
  scrim.addColorStop(1, "rgba(6,6,8,0.82)");
  ctx.fillStyle = scrim;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
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
// and loud, long ones stay bold but step down, same idea as the text posts
// in the feed.
function fitTitle(ctx, text, maxWidth, maxLines) {
  const sizes = [112, 104, 96, 88, 80, 72, 64, 58, 52];
  for (const size of sizes) {
    ctx.font = `800 ${size}px Inter, sans-serif`;
    const lines = wrapLines(ctx, text, maxWidth);
    if (lines.length <= maxLines) return { size, lines };
  }
  const size = sizes[sizes.length - 1];
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

// The name catches the light — the glow is built up from repeated shadowed
// passes, since canvas has no real text-glow primitive. Kept warm-white on
// dark cards; on the white card a glow would just look like smudged ink, so
// that one gets a soft drop shadow for weight instead.
function drawGlowText(ctx, text, x, y, { glow, color, blur }) {
  ctx.save();
  if (glow) {
    ctx.shadowColor = glow;
    ctx.shadowBlur = blur;
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    ctx.fillText(text, x, y);
  }
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
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
      accent: "#B96A0C",
      pillBg: "rgba(17,17,17,0.08)",
      pillInk: "rgba(17,17,17,0.72)",
      titleGlow: "rgba(17,17,17,0.18)",
      titleBlur: 18
    };
  }
  return {
    ink: "#FFFFFF",
    soft: "rgba(255,255,255,0.66)",
    accent: "#F7BC69",
    pillBg: "rgba(255,255,255,0.18)",
    pillInk: "rgba(255,255,255,0.94)",
    titleGlow: "rgba(255,246,228,0.55)",
    titleBlur: 38
  };
}

/**
 * Draws the poster and returns it as a Blob.
 * post: { title, budget, category, image_url, username }
 * background: "liquid" | "black" | "white"
 */
async function buildShareCard(post, { background = "liquid" } = {}) {
  await ensureCardFonts();

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
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext("2d");

  const contentW = CARD_W - CARD_PAD * 2;
  const theme = themeFor(background);

  // ---- backdrop ----
  if (background === "liquid") {
    drawLiquidBackdrop(ctx, img);
  } else if (background === "black") {
    ctx.fillStyle = "#08080A";
    ctx.fillRect(0, 0, CARD_W, CARD_H);
  } else {
    ctx.fillStyle = "#FAFAF8";
    ctx.fillRect(0, 0, CARD_W, CARD_H);
  }

  // ---- measure the text so the photo can claim everything that's left ----
  const topLimit = 104;
  const footerTop = CARD_H - 150;
  const bottomLimit = footerTop - 58;
  const maxTitleLines = img ? 3 : 6;

  const title = fitTitle(ctx, post.title || "Untitled", contentW, maxTitleLines);
  const titleLineH = Math.round(title.size * 1.08);
  const titleH = title.lines.length * titleLineH;

  const hasTag = Boolean(post.category);
  const hasBudget = Boolean(post.budget);
  const hasAuthor = Boolean(post.username);

  const GAP_ART = 46;
  const GAP_TAG = 22;
  const GAP_BUDGET = 16;
  const GAP_AUTHOR = 12;

  let textH = titleH;
  if (hasTag) textH += 52 + GAP_TAG;
  if (hasBudget) textH += 52 + GAP_BUDGET;
  if (hasAuthor) textH += 36 + GAP_AUTHOR;

  let artW = 0, artH = 0;
  if (img) {
    const available = bottomLimit - topLimit - textH - GAP_ART;
    const maxArtH = Math.max(420, Math.min(1300, available));
    const scale = Math.min(contentW / img.naturalWidth, maxArtH / img.naturalHeight);
    artW = Math.round(img.naturalWidth * scale);
    artH = Math.round(img.naturalHeight * scale);
  }

  // Photo first, text tucked underneath — bias the block upward so the
  // spare space collects between the copy and the footer rather than
  // above the photo.
  const blockH = (img ? artH + GAP_ART : 0) + textH;
  let y = Math.max(topLimit, topLimit + (bottomLimit - topLimit - blockH) * 0.34);

  // ---- artwork ----
  if (img) {
    const artX = Math.round((CARD_W - artW) / 2);
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
  ctx.font = `800 ${title.size}px Inter, sans-serif`;
  for (const line of title.lines) {
    y += titleLineH;
    drawGlowText(ctx, line, CARD_PAD, y - Math.round(titleLineH * 0.2), {
      glow: theme.titleGlow,
      blur: theme.titleBlur,
      color: theme.ink
    });
  }

  // ---- budget ----
  if (hasBudget) {
    y += GAP_BUDGET;
    ctx.fillStyle = theme.accent;
    ctx.font = "700 48px Inter, sans-serif";
    ctx.textBaseline = "top";
    ctx.fillText(post.budget, CARD_PAD, y);
    ctx.textBaseline = "alphabetic";
    y += 52;
  }

  // ---- author ----
  if (hasAuthor) {
    y += GAP_AUTHOR;
    ctx.fillStyle = theme.soft;
    ctx.font = "500 34px Inter, sans-serif";
    ctx.textBaseline = "top";
    ctx.fillText(`asked by ${post.username}`, CARD_PAD, y);
    ctx.textBaseline = "alphabetic";
  }

  // ---- footer ----
  ctx.fillStyle = theme.ink;
  ctx.font = "600 56px 'Cormorant Garamond', serif";
  ctx.fillText("Esven", CARD_PAD, footerTop);

  ctx.fillStyle = theme.soft;
  ctx.font = "500 26px 'IBM Plex Mono', monospace";
  ctx.textBaseline = "top";
  ctx.fillText(CARD_TAGLINE, CARD_PAD, footerTop + 22);
  ctx.textBaseline = "alphabetic";

  return new Promise(resolve => canvas.toBlob(resolve, CARD_TYPE, CARD_QUALITY));
}

function shareCardFileName(post) {
  const base = String(post.title || "esven-post")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "esven-post";
  return `esven-${base}.jpg`;
}

// Opens the native share sheet when the browser supports sharing files
// (every current mobile browser does — that's the Instagram-story path).
// Desktop browsers mostly don't, so they get the image to save instead.
async function shareOrDownloadCard(post, blob) {
  const file = new File([blob], shareCardFileName(post), { type: CARD_TYPE });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: post.title || "Esven" });
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
