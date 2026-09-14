const requestId = window.location.hash.slice(1);

let currentRequest = null;
// Resolves once loadRequest() has populated currentRequest. Other loaders that
// only need it at the very end await this instead of running after it.
let requestLoaded = null;

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

let spotifyIframeApi = null;
let spotifyController = null;

function spotifyEmbedUrl(url) {
  if (!url) return null;
  const match = url.match(/track\/([a-zA-Z0-9]+)/);
  if (!match) return null;
  return `https://open.spotify.com/embed/track/${match[1]}?utm_source=generator&theme=0`;
}

function spotifyTrackUri(url) {
  const match = url?.match(/track\/([a-zA-Z0-9]+)/);
  return match ? `spotify:track:${match[1]}` : null;
}

window.onSpotifyIframeApiReady = (api) => {
  spotifyIframeApi = api;
  if (currentRequest) {
    const shouldAutoplay = (() => {
      try { return sessionStorage.getItem("esven-autoplay-request") === currentRequest.id; } catch (_) { return false; }
    })();
    if (shouldAutoplay) {
      try { sessionStorage.removeItem("esven-autoplay-request"); } catch (_) {}
      tryPlaySpotify(currentRequest);
    }
  }
};

function tryPlaySpotify(r) {
  const player = document.getElementById("request-spotify-player");
  const uri = spotifyTrackUri(r.spotify_url);
  if (!player || !uri || !spotifyIframeApi) return;
  spotifyIframeApi.createController(player, { uri, width: "100%", height: "152" }, (controller) => {
    spotifyController = controller;
    controller.play();
  });
}

function revealOnScroll(selector) {
  const items = document.querySelectorAll(selector);
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("reveal");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });
  items.forEach(el => observer.observe(el));
}

async function loadRequest() {
  const detail = document.getElementById("request-detail");

  if (!requestId) {
    detail.innerHTML = `<p class="empty-state">No request specified.</p>`;
    return;
  }

  const [{ data: r, error }, { data: likes }, user] = await Promise.all([
    supabase
      .from("requests")
      .select("id, title, description, budget, category, spotify_url, image_url, image_width, image_height, is_sponsored, created_at, user_id, profiles!requests_user_id_fkey(username, avatar_url)")
      .eq("id", requestId)
      .single(),
    supabase.from("likes").select("user_id").eq("request_id", requestId),
    getCurrentUser()
  ]);

  if (error || !r) {
    detail.innerHTML = `<p class="empty-state">Request not found.</p>`;
    return;
  }

  currentRequest = r;
  recordRecentlyViewed(r.id);
  const embed = spotifyEmbedUrl(r.spotify_url);
  const likedBy = new Set((likes ?? []).map(l => l.user_id));
  const isLiked = user ? likedBy.has(user.id) : false;

  // Known dimensions let the browser hold the right amount of space open, so
  // the title and description below don't get shoved down when the photo lands.
  const detailDims = r.image_width && r.image_height
    ? ` width="${r.image_width}" height="${r.image_height}"`
    : "";

  detail.innerHTML = `
    ${r.image_url ? `<div class="detail-image"><img src="${r.image_url}" alt=""${detailDims} decoding="async"><button type="button" class="like-btn${isLiked ? " is-liked" : ""}" id="detail-like-btn" aria-label="Like">${ICONS.heart}<span class="like-count">${likedBy.size ? likedBy.size : ""}</span></button></div>` : ""}
    ${r.category ? `<span class="ticket-cat">${r.category}</span>` : ""}
    ${r.title ? `<h1>${escapeHtml(r.title)}</h1>` : ""}
    <p>${escapeHtml(r.description ?? "")}</p>
    ${embed ? `<div class="spotify-player-shell" data-track-player><div id="request-spotify-player"></div><button class="spotify-play-hint" type="button" data-play-spotify>Tap to play on Spotify</button><iframe class="spotify-embed-fallback" src="${embed}" width="100%" height="152" frameborder="0" allow="encrypted-media"></iframe></div>` : ""}
    <div class="request-meta">
      <span class="ticket-author">${r.profiles?.avatar_url ? `<img src="${r.profiles.avatar_url}" class="mini-avatar" width="36" height="36" loading="lazy" decoding="async">` : `<span class="mini-avatar mini-avatar-empty"></span>`}${r.profiles?.username ?? "someone"}</span>
      ${r.budget ? `<span class="ticket-budget">Budget: ${escapeHtml(r.budget)}</span>` : ""}
      <span>${new Date(r.created_at).toLocaleDateString()}</span>
    </div>
    <div class="share-row">
      <button type="button" class="btn btn-ghost share-btn" id="share-post-btn">${ICONS.share ?? ""}<span>Share as poster</span></button>
    </div>
  `;

  wireShareButton(r);

  const likeButton = document.getElementById("detail-like-btn");
  if (likeButton) {
    likeButton.addEventListener("click", async () => {
      const currentUser = await getCurrentUser();
      if (!currentUser) { alert("Sign in up top first to like a post."); return; }
      const alreadyLiked = likedBy.has(currentUser.id);
      if (alreadyLiked) likedBy.delete(currentUser.id); else likedBy.add(currentUser.id);
      likeButton.classList.toggle("is-liked", !alreadyLiked);
      likeButton.querySelector(".like-count").textContent = likedBy.size ? likedBy.size : "";

      const { error: likeError } = alreadyLiked
        ? await supabase.from("likes").delete().eq("request_id", r.id).eq("user_id", currentUser.id)
        : await supabase.from("likes").insert({ request_id: r.id, user_id: currentUser.id });

      if (likeError) {
        if (alreadyLiked) likedBy.add(currentUser.id); else likedBy.delete(currentUser.id);
        likeButton.classList.toggle("is-liked", alreadyLiked);
        likeButton.querySelector(".like-count").textContent = likedBy.size ? likedBy.size : "";
      }
    });
  }

  const playButton = detail.querySelector("[data-play-spotify]");
  if (playButton) {
    playButton.addEventListener("click", () => tryPlaySpotify(r));
    const shouldAutoplay = (() => {
      try { return sessionStorage.getItem("esven-autoplay-request") === r.id; } catch (_) { return false; }
    })();
    if (shouldAutoplay) {
      try { sessionStorage.removeItem("esven-autoplay-request"); } catch (_) {}
      window.setTimeout(() => tryPlaySpotify(r), 120);
    }
  }
}

// Builds the poster, then shows it before sending anywhere. Previewing first
// isn't only nicer — navigator.share() needs to be called from a real user
// gesture, and rendering the canvas takes long enough that browsers can drop
// the activation from the original click. The button inside the preview is a
// fresh gesture, so sharing always works.
function wireShareButton(post) {
  const button = document.getElementById("share-post-btn");
  if (!button) return;

  button.addEventListener("click", async () => {
    const label = button.querySelector("span");
    const original = label.textContent;
    button.disabled = true;
    label.textContent = "Making poster...";

    try {
      const card = {
        title: post.title,
        budget: post.budget,
        category: post.category,
        image_url: post.image_url,
        username: post.profiles?.username ?? null
      };
      // The 4:5 feed-post size is for promoting the site, so it's offered to
      // admins only; everyone else shares a story.
      const viewer = await getMyProfile();
      const canPickFormat = viewer?.is_admin === true;

      const background = card.image_url ? "liquid" : "white";
      const format = "story";
      const blob = await buildShareCard(card, { background, format });
      if (!blob) throw new Error("Couldn't render the poster.");
      openSharePreview(card, blob, { background, format, canPickFormat });
    } catch (err) {
      alert("Couldn't make the poster: " + err.message);
    } finally {
      button.disabled = false;
      label.textContent = original;
    }
  });
}

function openSharePreview(post, blob, { background, format, canPickFormat }) {
  let currentBlob = blob;
  let currentUrl = URL.createObjectURL(blob);
  let currentBg = background;
  let currentFormat = format;
  let currentShowTitle = true;
  let rendering = false;

  // Hiding the name only makes sense when there's a photo to carry the
  // poster — on a text-only post the name *is* the poster — and when the
  // post has a name to hide in the first place.
  const canToggleTitle = Boolean(post.image_url && String(post.title || "").trim());

  const canShareFile = Boolean(
    navigator.canShare &&
    navigator.canShare({ files: [new File([blob], "card.jpg", { type: blob.type })] })
  );

  // "liquid" blurs the post's own photo behind itself, so it's only offered
  // when there is a photo.
  const backgrounds = [
    ...(post.image_url ? [{ id: "liquid", label: "Liquid" }] : []),
    { id: "black", label: "Black" },
    { id: "white", label: "White" }
  ];

  const modal = document.createElement("div");
  modal.className = "share-modal open";
  modal.innerHTML = `
    <div class="share-modal-inner">
      <button class="panel-close" type="button" data-close>&times;</button>
      <div class="share-preview-shell">
        <img class="share-preview" src="${currentUrl}" alt="Shareable poster for this post">
      </div>
      ${canPickFormat ? `
      <div class="share-seg-row" role="group" aria-label="Poster size">
        <button type="button" class="share-seg-chip${currentFormat === "story" ? " active" : ""}" data-format="story">Story 9:16</button>
        <button type="button" class="share-seg-chip${currentFormat === "post" ? " active" : ""}" data-format="post">Post 4:5</button>
      </div>` : ""}
      ${canToggleTitle ? `
      <div class="share-seg-row" role="group" aria-label="Show the post name">
        <button type="button" class="share-seg-chip active" data-title="show">Name on</button>
        <button type="button" class="share-seg-chip" data-title="hide">Name off</button>
      </div>` : ""}
      <div class="share-seg-row" role="group" aria-label="Poster background">
        ${backgrounds.map(o => `<button type="button" class="share-seg-chip${o.id === currentBg ? " active" : ""}" data-bg="${o.id}">${o.label}</button>`).join("")}
      </div>
      <div class="share-actions">
        ${canShareFile ? `<button type="button" class="btn" data-share>Share</button>` : ""}
        <button type="button" class="btn btn-ghost" data-save>Save image</button>
      </div>
      <p class="field-hint share-hint">${canShareFile
        ? "Share straight to your Instagram story, or save it."
        : "Save the image, then post it to your story."}</p>
    </div>`;

  const preview = modal.querySelector(".share-preview");
  const shell = modal.querySelector(".share-preview-shell");

  const close = () => { URL.revokeObjectURL(currentUrl); modal.remove(); };
  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
  modal.querySelector("[data-close]").onclick = close;

  // Both pickers funnel through here. The photo is already cached from the
  // first render, so a swap is a redraw rather than another download.
  const rerender = async (nextBg, nextFormat, nextShowTitle = currentShowTitle) => {
    if (rendering) return;
    rendering = true;
    shell.classList.add("is-rendering");
    try {
      const next = await buildShareCard(post, { background: nextBg, format: nextFormat, showTitle: nextShowTitle });
      if (!next) throw new Error("render failed");
      URL.revokeObjectURL(currentUrl);
      currentBlob = next;
      currentUrl = URL.createObjectURL(next);
      currentBg = nextBg;
      currentFormat = nextFormat;
      currentShowTitle = nextShowTitle;
      preview.src = currentUrl;
      modal.querySelectorAll("[data-bg]").forEach(c =>
        c.classList.toggle("active", c.dataset.bg === currentBg));
      modal.querySelectorAll("[data-format]").forEach(c =>
        c.classList.toggle("active", c.dataset.format === currentFormat));
      modal.querySelectorAll("[data-title]").forEach(c =>
        c.classList.toggle("active", (c.dataset.title === "show") === currentShowTitle));
    } catch (_) {
      // Keep the poster that's already on screen.
    } finally {
      rendering = false;
      shell.classList.remove("is-rendering");
    }
  };

  modal.querySelectorAll("[data-bg]").forEach(chip => {
    chip.onclick = () => {
      if (chip.dataset.bg !== currentBg) rerender(chip.dataset.bg, currentFormat);
    };
  });
  modal.querySelectorAll("[data-title]").forEach(chip => {
    chip.onclick = () => {
      const show = chip.dataset.title === "show";
      if (show !== currentShowTitle) rerender(currentBg, currentFormat, show);
    };
  });
  modal.querySelectorAll("[data-format]").forEach(chip => {
    chip.onclick = () => {
      if (chip.dataset.format !== currentFormat) rerender(currentBg, chip.dataset.format);
    };
  });

  const shareBtn = modal.querySelector("[data-share]");
  if (shareBtn) shareBtn.onclick = async () => {
    const result = await shareOrDownloadCard(post, currentBlob, currentFormat);
    if (result === "shared") close();
  };

  modal.querySelector("[data-save]").onclick = () => {
    const a = document.createElement("a");
    a.href = currentUrl;
    a.download = shareCardFileName(post, currentFormat);
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  document.body.appendChild(modal);
}

async function loadRecommendations() {
  const list = document.getElementById("rec-list");

  // The recommendations query only needs the id from the URL, so it goes out
  // at the same time as the request itself rather than queueing behind it.
  // The session and profile reads ride along in the same batch.
  const [{ data: recs, error }, user, profile] = await Promise.all([
    supabase
      .from("recommendations")
      .select("id, note, link, image_url, image_width, image_height, is_favorite, created_at, user_id, profiles(username, avatar_url)")
      .eq("request_id", requestId)
      .order("is_favorite", { ascending: false })
      .order("created_at", { ascending: false }),
    getCurrentUser(),
    getMyProfile()
  ]);

  if (error) {
    list.innerHTML = `<p class="empty-state">Couldn't load recommendations: ${error.message}</p>`;
    return;
  }

  if (!recs.length) {
    list.innerHTML = `<p class="empty-state">No recommendations yet.</p>`;
    return;
  }

  // "Mark favorite" is the request owner's call, so wait for the request row
  // (already in flight) before deciding which buttons to draw.
  await requestLoaded;
  const isOwner = user && currentRequest && user.id === currentRequest.user_id;
  const isAdmin = profile?.is_admin === true;

  list.innerHTML = recs.map(rec => `
    <div class="rec-card ${rec.is_favorite ? "is-favorite" : ""}">
      ${rec.is_favorite ? `<span class="rec-favorite-badge">★ Favorite</span>` : ""}
      ${rec.image_url ? `<div class="rec-image"><img src="${rec.image_url}" alt=""${rec.image_width && rec.image_height ? ` width="${rec.image_width}" height="${rec.image_height}"` : ""} loading="lazy" decoding="async"></div>` : ""}
      <p class="rec-note">${escapeHtml(rec.note)}</p>
      ${rec.link ? `<a class="rec-link" href="${escapeHtml(rec.link)}" target="_blank" rel="noopener">${escapeHtml(rec.link)}</a>` : ""}
      <div class="rec-footer">
        <span class="ticket-author">${rec.profiles?.avatar_url ? `<img src="${rec.profiles.avatar_url}" class="mini-avatar" width="36" height="36" loading="lazy" decoding="async">` : `<span class="mini-avatar mini-avatar-empty"></span>`}${rec.profiles?.username ?? "someone"}</span>
        <span class="rec-actions">
          ${isOwner && !rec.is_favorite ? `<button class="fav-btn" data-id="${rec.id}">Mark favorite</button>` : ""}
          ${user && (user.id === rec.user_id || isAdmin) ? `<button class="delete-rec-btn" data-id="${rec.id}">Delete</button>` : ""}
        </span>
      </div>
    </div>
  `).join("");

  document.querySelectorAll(".delete-rec-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Delete this recommendation?")) return;
      const { error } = await supabase.from("recommendations").delete().eq("id", btn.dataset.id);
      if (error) { alert("Couldn't delete: " + error.message); return; }
      loadRecommendations();
    });
  });

  if (isOwner) {
    document.querySelectorAll(".fav-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const { error } = await supabase
          .from("recommendations")
          .update({ is_favorite: true })
          .eq("id", btn.dataset.id);
        if (error) { alert("Couldn't mark favorite: " + error.message); return; }
        loadRecommendations();
      });
    });
  }

  requestAnimationFrame(() => revealOnScroll(".rec-card"));
}

// Returns { url, width, height } — see uploadRequestImage in app.js.
async function uploadRecImage(user, file) {
  if (!file) return { url: "", width: null, height: null };
  const { blob, width, height, name } = await prepareImageForUpload(file);
  const path = `${user.id}/${Date.now()}-${name.replace(/[^a-zA-Z0-9.]/g, "_")}`;
  const { error } = await supabase.storage.from("request-images").upload(path, blob);
  if (error) throw error;
  const { data } = supabase.storage.from("request-images").getPublicUrl(path);
  return { url: data.publicUrl, width, height };
}

// No forced crop/aspect-ratio — just a minimum size so tiny images don't
// end up in the feed. Matches the request-post upload behavior.
const MIN_IMAGE_WIDTH = 480;
const MIN_IMAGE_HEIGHT = 480;

function checkImageMinSize(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      if (img.naturalWidth < MIN_IMAGE_WIDTH || img.naturalHeight < MIN_IMAGE_HEIGHT) {
        reject(new Error(`Photo is too small — it needs to be at least ${MIN_IMAGE_WIDTH}×${MIN_IMAGE_HEIGHT}px (this one is ${img.naturalWidth}×${img.naturalHeight}).`));
        return;
      }
      resolve();
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Couldn't read that image. Try a different file.")); };
    img.src = url;
  });
}

function initRecImagePreview() {
  const fileInput = document.getElementById("rec-image-file");
  const preview = document.getElementById("rec-image-preview");
  const labelText = document.getElementById("rec-upload-label-text");
  if (!fileInput) return;
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    if (!file) return;
    try {
      await checkImageMinSize(file);
      preview.src = URL.createObjectURL(file);
      preview.style.display = "block";
      labelText.textContent = "Photo selected";
    } catch (err) {
      alert(err.message);
      fileInput.value = "";
      preview.style.display = "none";
      labelText.textContent = "+ Add a photo";
    }
  });
}

async function initRecForm() {
  const user = await getCurrentUser();
  const section = document.getElementById("rec-form-section");
  if (!user) {
    section.style.display = "none";
    return;
  }
  section.style.display = "block";
  initRecImagePreview();

  let isSubmittingRec = false;

  document.getElementById("rec-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (isSubmittingRec) return; // guards against double-tap/double-submit firing this twice
    isSubmittingRec = true;

    const submitBtn = e.target.querySelector("button[type=submit]");
    const submitLabel = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = "Posting...";

    try {
      const note = document.getElementById("rec-note").value.trim();
      const link = applyAffiliateTag(document.getElementById("rec-link").value.trim());
      const file = document.getElementById("rec-image-file").files[0];

      let image_url = "", image_width = null, image_height = null;
      try {
        ({ url: image_url, width: image_width, height: image_height } = await uploadRecImage(user, file));
      } catch (err) {
        alert("Couldn't upload image: " + err.message);
        return;
      }

      const { error } = await supabase.from("recommendations").insert({
        request_id: requestId,
        user_id: user.id,
        note, link, image_url, image_width, image_height
      });

      if (error) {
        alert("Couldn't post: " + error.message);
        return;
      }

      e.target.reset();
      document.getElementById("rec-image-preview").style.display = "none";
      document.getElementById("rec-upload-label-text").textContent = "+ Add a photo";
      loadRecommendations();
    } finally {
      isSubmittingRec = false;
      submitBtn.disabled = false;
      submitBtn.textContent = submitLabel;
    }
  });
}

async function initPromoteBox() {
  const box = document.getElementById("promote-box");
  const hint = document.getElementById("promote-hint");
  if (!currentRequest) return;

  const user = await getCurrentUser();
  const isOwner = user && user.id === currentRequest.user_id;
  if (!isOwner) return;

  if (currentRequest.is_sponsored) {
    box.style.display = "block";
    box.querySelector("#promote-btn").style.display = "none";
    hint.textContent = "★ This listing is promoted.";
    return;
  }

  box.style.display = "block";
  document.getElementById("promote-btn").addEventListener("click", openPromoteModal);
}

async function openPromoteModal() {
  const modal = document.getElementById("promote-modal");
  const body = document.getElementById("promote-modal-body");
  modal.classList.add("open");
  body.innerHTML = `<p class="empty-state">Creating payment...</p>`;

  try {
    const res = await fetch("/api/create-promotion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId })
    });
    const data = await res.json();

    if (!res.ok) {
      body.innerHTML = `<p class="empty-state">Couldn't start payment: ${escapeHtml(data.error || "unknown error")}</p>`;
      return;
    }

    body.innerHTML = `
      <p style="text-align:center; margin-bottom:14px;">Scan with any Mongolian banking app — ${data.amount}₮</p>
      <img src="data:image/png;base64,${data.qrImage}" alt="QPay QR code" style="width:220px; display:block; margin:0 auto 14px;" />
      <p class="empty-state" id="promote-status">Waiting for payment...</p>
    `;

    pollPromotionStatus();
  } catch (err) {
    body.innerHTML = `<p class="empty-state">Couldn't start payment: ${escapeHtml(err.message)}</p>`;
  }
}

async function pollPromotionStatus() {
  const statusEl = document.getElementById("promote-status");
  const interval = setInterval(async () => {
    try {
      const res = await fetch(`/api/check-promotion?requestId=${requestId}`);
      const data = await res.json();
      if (data.isSponsored) {
        clearInterval(interval);
        if (statusEl) statusEl.textContent = "Payment received — listing is now promoted!";
        setTimeout(() => window.location.reload(), 1500);
      }
    } catch {
      // keep polling silently
    }
  }, 3000);
}

function initPromoteModalClose() {
  document.getElementById("promote-close-btn").addEventListener("click", () => {
    document.getElementById("promote-modal").classList.remove("open");
  });
}

document.addEventListener("DOMContentLoaded", () => {
  // All three network-bound loaders start together instead of in a chain.
  requestLoaded = loadRequest();
  loadRecommendations();
  initRecForm();
  initPromoteModalClose();
  requestLoaded.then(initPromoteBox);

  // The hash *is* the request id, so a hash change means a different post.
  // Without this the page would keep showing the previous one.
  window.addEventListener("hashchange", () => window.location.reload());
});
