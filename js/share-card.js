// Generates a shareable poster image for a post — the thing people send to
// their Instagram story instead of a bare link. Everything is drawn into a
// canvas in the browser (no server, no build step), then handed to the native
// share sheet via the Web Share API, with a download fallback on desktop.
//
// The backdrop colour is sampled from the post's own photo, so every card
// comes out looking made for that item rather than dropped into a template.

const CARD_W = 1080;
const CARD_H = 1920;          // 9:16 — Instagram/TikTok story shape
const CARD_PAD = 80;
const CARD_TYPE = "image/jpeg";
const CARD_QUALITY = 0.94;

// Canvas can only use a font weight the browser has actually downloaded.
// Google Fonts serves each weight as its own file and only fetches the ones
// the page already renders, so ask for these explicitly before drawing —
// otherwise the card silently falls back to a default sans and looks wrong.
async function ensureCardFonts() {
  if (!document.fonts) return;
  const needed = [
    "800 88px Inter",
    "700 44px Inter",
    "500 30px Inter",
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

function loadCardImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Required so the canvas isn't tainted and toBlob() still works.
    // Supabase storage serves public objects with access-control-allow-origin: *.
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't load that image"));
    img.src = src;
  });
}

// Average the photo down to a single colour, weighting saturated pixels more
// heavily — a flat average of a photo tends toward muddy grey, which makes
// every card look the same.
function sampleBackdrop(img) {
  const size = 24;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, size, size);

  let r = 0, g = 0, b = 0, total = 0;
  try {
    const { data } = ctx.getImageData(0, 0, size, size);
    for (let i = 0; i < data.length; i += 4) {
      const rr = data[i], gg = data[i + 1], bb = data[i + 2];
      const max = Math.max(rr, gg, bb);
      const min = Math.min(rr, gg, bb);
      const sat = max === 0 ? 0 : (max - min) / max;
      const weight = 0.25 + sat;
      r += rr * weight; g += gg * weight; b += bb * weight; total += weight;
    }
  } catch (_) {
    return { top: "#2A2A2E", bottom: "#0B0B0A" };
  }
  if (!total) return { top: "#2A2A2E", bottom: "#0B0B0A" };

  r /= total; g /= total; b /= total;

  // Averaging a photo pulls every colour toward the middle, so the raw result
  // reads as near-black once it's darkened enough for white type. Push the
  // channels away from their own mean to bring the hue back, then rescale to
  // a fixed brightness — that way the backdrop is always dark enough to read
  // on, but you can still tell which photo it came from.
  const mean = (r + g + b) / 3;
  const saturate = 1.75;
  r = mean + (r - mean) * saturate;
  g = mean + (g - mean) * saturate;
  b = mean + (b - mean) * saturate;

  const peak = Math.max(r, g, b, 1);
  const toStop = (targetPeak) => {
    const k = targetPeak / peak;
    const m = (v) => Math.round(Math.min(255, Math.max(0, v * k)));
    return `rgb(${m(r)}, ${m(g)}, ${m(b)})`;
  };
  return { top: toStop(104), bottom: toStop(24) };
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
  const sizes = [96, 88, 80, 72, 64, 58, 52, 46];
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

function drawTagPill(ctx, text, x, y) {
  ctx.font = "600 26px 'IBM Plex Mono', monospace";
  const label = String(text).toUpperCase();
  const textW = ctx.measureText(label).width;
  const padX = 28;
  const h = 56;
  const w = textW + padX * 2;
  ctx.fillStyle = "rgba(255,255,255,0.16)";
  roundRectPath(ctx, x, y, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x + padX, y + h / 2 + 1);
  ctx.textBaseline = "alphabetic";
  return w;
}

/**
 * Draws the poster and returns it as a Blob.
 * post: { title, budget, category, audience, image_url, username }
 */
async function buildShareCard(post) {
  await ensureCardFonts();

  let img = null;
  if (post.image_url) {
    try {
      img = await loadCardImage(post.image_url);
    } catch (_) {
      img = null;   // fall through to the text-only treatment
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext("2d");

  const contentW = CARD_W - CARD_PAD * 2;

  // ---- backdrop ----
  if (img) {
    const { top, bottom } = sampleBackdrop(img);
    const grad = ctx.createLinearGradient(0, 0, 0, CARD_H);
    grad.addColorStop(0, top);
    grad.addColorStop(1, bottom);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CARD_W, CARD_H);

    const glow = ctx.createRadialGradient(CARD_W / 2, CARD_H * 0.34, 60, CARD_W / 2, CARD_H * 0.34, CARD_W * 0.85);
    glow.addColorStop(0, "rgba(255,255,255,0.10)");
    glow.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, CARD_W, CARD_H);
  } else {
    // Text-only posts keep Esven's light, editorial look instead.
    ctx.fillStyle = "#FAFAF8";
    ctx.fillRect(0, 0, CARD_W, CARD_H);
  }

  const onDark = Boolean(img);
  const inkStrong = onDark ? "#FFFFFF" : "#111111";
  const inkSoft = onDark ? "rgba(255,255,255,0.62)" : "#6B6B68";
  const accent = onDark ? "#F5B463" : "#B96A0C";

  // ---- measure the text block so the artwork can take whatever's left ----
  const topLimit = 150;
  const bottomLimit = CARD_H - 260;   // leaves room for the footer
  const maxTitleLines = img ? 3 : 6;

  const title = fitTitle(ctx, post.title || "Untitled", contentW, maxTitleLines);
  const titleLineH = Math.round(title.size * 1.12);
  const titleH = title.lines.length * titleLineH;

  const hasTag = Boolean(post.category);
  const hasBudget = Boolean(post.budget);
  const hasAuthor = Boolean(post.username);

  const GAP_ART = 68;
  const GAP_TAG = 30;
  const GAP_BUDGET = 26;
  const GAP_AUTHOR = 20;

  let textH = titleH;
  if (hasTag) textH += 56 + GAP_TAG;
  if (hasBudget) textH += 56 + GAP_BUDGET;
  if (hasAuthor) textH += 40 + GAP_AUTHOR;

  let artW = 0, artH = 0;
  if (img) {
    const available = bottomLimit - topLimit - textH - GAP_ART;
    const maxArtH = Math.max(380, Math.min(1040, available));
    const scale = Math.min(contentW / img.naturalWidth, maxArtH / img.naturalHeight);
    artW = Math.round(img.naturalWidth * scale);
    artH = Math.round(img.naturalHeight * scale);
  }

  // Sit slightly above centre rather than dead centre — the footer occupies
  // the bottom of the card, so true centring leaves the block looking low.
  const blockH = (img ? artH + GAP_ART : 0) + textH;
  let y = Math.max(topLimit, topLimit + (bottomLimit - topLimit - blockH) * 0.42);

  // ---- artwork ----
  if (img) {
    const artX = Math.round((CARD_W - artW) / 2);
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = 60;
    ctx.shadowOffsetY = 24;
    roundRectPath(ctx, artX, y, artW, artH, 36);
    ctx.fillStyle = "#000";
    ctx.fill();
    ctx.restore();

    ctx.save();
    roundRectPath(ctx, artX, y, artW, artH, 36);
    ctx.clip();
    ctx.drawImage(img, artX, y, artW, artH);
    ctx.restore();

    y += artH + GAP_ART;
  }

  // ---- tag ----
  if (hasTag) {
    drawTagPill(ctx, post.category, CARD_PAD, y);
    y += 56 + GAP_TAG;
  }

  // ---- title ----
  ctx.fillStyle = inkStrong;
  ctx.font = `800 ${title.size}px Inter, sans-serif`;
  for (const line of title.lines) {
    y += titleLineH;
    ctx.fillText(line, CARD_PAD, y - Math.round(titleLineH * 0.22));
  }

  // ---- budget ----
  if (hasBudget) {
    y += GAP_BUDGET;
    ctx.fillStyle = accent;
    ctx.font = "700 44px Inter, sans-serif";
    ctx.textBaseline = "top";
    ctx.fillText(post.budget, CARD_PAD, y);
    ctx.textBaseline = "alphabetic";
    y += 56;
  }

  // ---- author ----
  if (hasAuthor) {
    y += GAP_AUTHOR;
    ctx.fillStyle = inkSoft;
    ctx.font = "500 30px Inter, sans-serif";
    ctx.textBaseline = "top";
    ctx.fillText(`asked by ${post.username}`, CARD_PAD, y);
    ctx.textBaseline = "alphabetic";
  }

  // ---- footer ----
  const footerY = CARD_H - 150;
  ctx.fillStyle = inkStrong;
  ctx.font = "600 56px 'Cormorant Garamond', serif";
  ctx.fillText("Esven", CARD_PAD, footerY);

  ctx.fillStyle = inkSoft;
  ctx.font = "500 26px 'IBM Plex Mono', monospace";
  ctx.textBaseline = "top";
  ctx.fillText("ask anyone, find anything", CARD_PAD, footerY + 22);
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
