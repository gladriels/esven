// Shared image handling for uploads.
//
// Phones shoot 4-12MP photos and screenshots come out as multi-megabyte PNGs,
// but the feed renders them ~170-350px wide and the detail page caps at 70vh.
// Uploading originals meant the feed was pulling ~50MB of images per page load
// to display a few hundred KB worth of pixels. Everything is downscaled and
// re-encoded in the browser before it ever leaves the device.

const IMAGE_MAX_EDGE = 1400;   // generous for retina full-screen viewing
const IMAGE_QUALITY = 0.82;

function loadImageElement(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Couldn't read that image. Try a different file.")); };
    img.src = url;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise(resolve => canvas.toBlob(resolve, type, quality));
}

// Returns { blob, width, height, name } ready to upload. Dimensions are the
// *encoded* ones, so callers can persist them and render <img width height>
// to reserve exact layout space before the bytes arrive.
async function prepareImageForUpload(file, { maxEdge = IMAGE_MAX_EDGE } = {}) {
  const { img, url } = await loadImageElement(file);
  try {
    const { naturalWidth: w, naturalHeight: h } = img;
    const scale = Math.min(1, maxEdge / Math.max(w, h));
    const outW = Math.round(w * scale);
    const outH = Math.round(h * scale);

    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    // Flatten onto white: JPEG/WebP have no alpha, and transparent PNG areas
    // would otherwise encode as black.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, outW, outH);
    ctx.drawImage(img, 0, 0, outW, outH);

    // A browser that can't encode WebP doesn't fail — toBlob quietly hands back
    // a PNG instead, which would be both larger than the original and saved
    // under a lying .webp name. Check the type we actually got, not just that
    // something came back.
    let blob = await canvasToBlob(canvas, "image/webp", IMAGE_QUALITY);
    let ext = "webp";
    if (!blob || blob.type !== "image/webp") {
      blob = await canvasToBlob(canvas, "image/jpeg", IMAGE_QUALITY);
      ext = "jpg";
    }
    // If re-encoding somehow made it bigger (already-optimised small files),
    // keep the original bytes but still report the true dimensions.
    if (blob && blob.size >= file.size && scale === 1) {
      return { blob: file, width: w, height: h, name: file.name };
    }

    const base = file.name.replace(/\.[^.]+$/, "") || "image";
    return { blob, width: outW, height: outH, name: `${base}.${ext}` };
  } finally {
    URL.revokeObjectURL(url);
  }
}
