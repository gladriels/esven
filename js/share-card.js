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

// The feed-post size exists for promoting the site, so it's offered to
// admins only.

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

// The photo reduced to a few soft fields of its own colour, filling the whole
// card behind itself.
//
// Three things keep it clean rather than muddy:
//  - It's sampled at only 14px wide, so what survives is broad colour, not the
//    photo's shapes. At 42px the old version kept recognisable edges — a dark
//    pillar against grass stayed a hard line — which read as a dirty copy of
//    the photo instead of a wash of its colours.
//  - It grows in 2x steps rather than one ~25x stretch. A single bilinear
//    stretch is linear between samples, so every sample shows as a crease;
//    repeated doublings smooth the creases out.
//  - Colour is toned on the tiny canvas directly — a little more saturation,
//    brightness pulled into a band white type reads over — instead of
//    ctx.filter (Safari only got it in 17.4) plus a heavy flat scrim that
//    dragged everything toward grey.
const LIQUID_SAMPLE_W = 14;
const LIQUID_SAT = 1.3;
const LIQUID_LUM_LOW = 50;
const LIQUID_LUM_HIGH = 124;

function drawLiquidBackdrop(ctx, img, W, H) {
  const sw0 = LIQUID_SAMPLE_W;
  const sh0 = Math.max(1, Math.round(sw0 * (H / W)));
  let src = document.createElement("canvas");
  src.width = sw0;
  src.height = sh0;
  const sctx = src.getContext("2d", { willReadFrequently: true });
  sctx.imageSmoothingEnabled = true;
  sctx.imageSmoothingQuality = "high";
  const { sx, sy, sw, sh } = coverCrop(img, sw0 / sh0, 1.25);
  sctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw0, sh0);

  let toned = false;
  try {
    const frame = sctx.getImageData(0, 0, sw0, sh0);
    const px = frame.data;
    for (let i = 0; i < px.length; i += 4) {
      let r = px[i], g = px[i + 1], b = px[i + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      r = lum + (r - lum) * LIQUID_SAT;
      g = lum + (g - lum) * LIQUID_SAT;
      b = lum + (b - lum) * LIQUID_SAT;
      // Shift rather than scale, so dark pixels don't get their noise
      // multiplied up into odd colours.
      const shift = LIQUID_LUM_LOW + (lum / 255) * (LIQUID_LUM_HIGH - LIQUID_LUM_LOW) - lum;
      px[i]     = Math.max(0, Math.min(255, r + shift));
      px[i + 1] = Math.max(0, Math.min(255, g + shift));
      px[i + 2] = Math.max(0, Math.min(255, b + shift));
    }
    sctx.putImageData(frame, 0, 0);
    toned = true;
  } catch (_) {
    // Tainted canvas — the heavier scrim below keeps type readable instead.
  }

  // Double up to about half the card's width, then one last short stretch.
  let cw = sw0, ch = sh0;
  while (cw * 2 <= W / 2) {
    const next = document.createElement("canvas");
    next.width = cw * 2;
    next.height = ch * 2;
    const nctx = next.getContext("2d");
    nctx.imageSmoothingEnabled = true;
    nctx.imageSmoothingQuality = "high";
    nctx.drawImage(src, 0, 0, next.width, next.height);
    src = next;
    cw = next.width;
    ch = next.height;
  }
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, W, H);
  ctx.restore();

  // A soft vignette draws the eye in to the photo; a fade at the bottom keeps
  // the footer legible. Both are light, since toning already did most of the
  // work the old flat scrim was doing.
  const vignette = ctx.createRadialGradient(
    W / 2, H * 0.42, Math.min(W, H) * 0.25,
    W / 2, H * 0.42, Math.max(W, H) * 0.75
  );
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, toned ? "rgba(0,0,0,0.30)" : "rgba(0,0,0,0.55)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);

  const foot = ctx.createLinearGradient(0, H * 0.7, 0, H);
  foot.addColorStop(0, "rgba(0,0,0,0)");
  foot.addColorStop(1, toned ? "rgba(0,0,0,0.50)" : "rgba(0,0,0,0.78)");
  ctx.fillStyle = foot;
  ctx.fillRect(0, H * 0.7, W, H * 0.3);

  if (!toned) {
    ctx.fillStyle = "rgba(6,6,8,0.35)";
    ctx.fillRect(0, 0, W, H);
  }

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

// fitTitle alone only shrinks a name when it physically has to — it picks the
// largest size that still fits the line budget, so a 48-character name came
// out at the same 112px as a 7-character one, just wrapped onto three lines.
// Length drives the size directly instead, so a long name actually reads as
// small; fitTitle then still steps it down further if it needs to.
function titleCapForLength(text) {
  const len = String(text || "").trim().length;
  if (len <= 12) return 112;
  if (len <= 22) return 96;
  if (len <= 34) return 78;
  if (len <= 50) return 62;
  if (len <= 75) return 50;
  if (len <= 110) return 40;
  return 32;
}

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
 * showTitle: false leaves the name off. A post with no name has nothing to
 *   show either way — names are optional when a photo is attached.
 */
async function buildShareCard(post, { background = "liquid", format = "story", showTitle = true } = {}) {
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

  const titleText = showTitle ? String(post.title || "").trim() : "";
  const hasTitle = Boolean(titleText);
  const hasTag = Boolean(post.category);
  const hasBudget = Boolean(post.budget);
  const hasAuthor = Boolean(post.username);

  // The 4:5 card has far less height to spend, so it starts the title ramp
  // lower — otherwise a big title would crowd the photo it sits on. Whichever
  // of that and the length-based cap is smaller wins.
  const maxTitleSize = Math.min(
    format === "post" ? 88 : 112,
    titleCapForLength(titleText)
  );
  const GAP_TAG = 20;
  const OVERLAY_PAD = 44;

  // Type sitting on the photo is always light — it has the scrim under it,
  // not the card's background, so it doesn't follow the card's theme.
  const photoTheme = { pillBg: "rgba(255,255,255,0.24)", pillInk: "#FFFFFF" };

  if (img) {
    // The name goes *on* the photo, so the photo is no longer sharing the
    // height with a text block underneath — it takes everything between the
    // top edge and the footer.
    const available = bottomLimit - topLimit;
    const maxArtH = Math.max(300, Math.min(Math.round(H * 0.9), available));
    const scale = Math.min(contentW / img.naturalWidth, maxArtH / img.naturalHeight);
    const artW = Math.round(img.naturalWidth * scale);
    const artH = Math.round(img.naturalHeight * scale);
    const artX = Math.round((W - artW) / 2);
    const artY = Math.round(topLimit + (available - artH) * 0.45);

    // Fit the name to the photo's width, then step it down further if the
    // overlay would take up too much of the photo it's meant to sit on.
    const titleMaxW = artW - OVERLAY_PAD * 2;
    let sizeCap = maxTitleSize;
    let title = { size: maxTitleSize, lines: [] };
    let titleLineH = 0, titleH = 0;
    let overlayH = hasTag ? 52 : 0;
    while (hasTitle) {
      title = fitTitle(ctx, titleText, titleMaxW, 3, sizeCap);
      titleLineH = Math.round(title.size * 1.08);
      titleH = title.lines.length * titleLineH;
      overlayH = titleH + (hasTag ? 52 + GAP_TAG : 0);
      if (overlayH <= artH * 0.55 || sizeCap <= 28) break;
      sizeCap = Math.max(28, Math.round(sizeCap * 0.85));
    }

    ctx.save();
    ctx.shadowColor = background === "white" ? "rgba(17,17,17,0.22)" : "rgba(0,0,0,0.55)";
    ctx.shadowBlur = 70;
    ctx.shadowOffsetY = 26;
    roundRectPath(ctx, artX, artY, artW, artH, 34);
    ctx.fillStyle = "#000";
    ctx.fill();
    ctx.restore();

    // Everything from here is clipped to the photo's rounded rect, so the
    // scrim follows its corners and the name can't spill onto the card.
    ctx.save();
    roundRectPath(ctx, artX, artY, artW, artH, 34);
    ctx.clip();
    ctx.drawImage(img, artX, artY, artW, artH);

    // With no name and no tag there's nothing to protect, so the photo is
    // left clean instead of getting a dark band along its bottom.
    if (overlayH) {
      const scrimH = Math.min(artH, overlayH + OVERLAY_PAD * 2 + 140);
      const scrimTop = artY + artH - scrimH;
      const scrim = ctx.createLinearGradient(0, scrimTop, 0, artY + artH);
      scrim.addColorStop(0, "rgba(0,0,0,0)");
      scrim.addColorStop(0.55, "rgba(0,0,0,0.46)");
      scrim.addColorStop(1, "rgba(0,0,0,0.84)");
      ctx.fillStyle = scrim;
      ctx.fillRect(artX, scrimTop, artW, scrimH);
    }

    let ty = artY + artH - OVERLAY_PAD - titleH;
    if (hasTag) {
      const tagY = hasTitle ? ty - GAP_TAG - 52 : artY + artH - OVERLAY_PAD - 52;
      drawTagPill(ctx, post.category, artX + OVERLAY_PAD, tagY, photoTheme);
    }
    ctx.fillStyle = "#FFFFFF";
    ctx.font = `800 ${title.size}px Inter, sans-serif`;
    for (const line of title.lines) {
      ty += titleLineH;
      ctx.fillText(line, artX + OVERLAY_PAD, ty - Math.round(titleLineH * 0.2));
    }
    ctx.restore();
  } else {
    // No photo to sit on, so the name keeps the card's own theme and sits
    // near the middle rather than stranded at the top of an empty page.
    const title = hasTitle ? fitTitle(ctx, titleText, contentW, 6, maxTitleSize) : { size: maxTitleSize, lines: [] };
    const titleLineH = Math.round(title.size * 1.08);
    const titleH = title.lines.length * titleLineH;
    const blockH = titleH + (hasTag ? 52 + (hasTitle ? GAP_TAG : 0) : 0);
    let y = Math.max(topLimit, topLimit + (bottomLimit - topLimit - blockH) * 0.42);

    if (hasTag) {
      drawTagPill(ctx, post.category, CARD_PAD, y, theme);
      y += 52 + GAP_TAG;
    }
    ctx.fillStyle = theme.ink;
    ctx.font = `800 ${title.size}px Inter, sans-serif`;
    for (const line of title.lines) {
      y += titleLineH;
      ctx.fillText(line, CARD_PAD, y - Math.round(titleLineH * 0.2));
    }
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
