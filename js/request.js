const requestId = window.location.hash.slice(1);

let currentRequest = null;

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

  const { data: r, error } = await supabase
    .from("requests")
    .select("id, title, description, budget, category, spotify_url, image_url, is_sponsored, created_at, user_id, profiles(username, avatar_url)")
    .eq("id", requestId)
    .single();

  if (error || !r) {
    detail.innerHTML = `<p class="empty-state">Request not found.</p>`;
    return;
  }

  currentRequest = r;
  const embed = spotifyEmbedUrl(r.spotify_url);

  detail.innerHTML = `
    ${r.image_url ? `<div class="detail-image"><img src="${r.image_url}" alt=""></div>` : ""}
    ${r.category ? `<span class="ticket-cat">${r.category}</span>` : ""}
    <h1>${escapeHtml(r.title)}</h1>
    <p>${escapeHtml(r.description ?? "")}</p>
    ${embed ? `<div class="spotify-player-shell" data-track-player><div id="request-spotify-player"></div><button class="spotify-play-hint" type="button" data-play-spotify>Tap to play on Spotify</button><iframe class="spotify-embed-fallback" src="${embed}" width="100%" height="152" frameborder="0" allow="encrypted-media"></iframe></div>` : ""}
    <div class="request-meta">
      <span class="ticket-author">${r.profiles?.avatar_url ? `<img src="${r.profiles.avatar_url}" class="mini-avatar">` : `<span class="mini-avatar mini-avatar-empty"></span>`}@${r.profiles?.username ?? "someone"}</span>
      ${r.budget ? `<span class="ticket-budget">Budget: ${escapeHtml(r.budget)}</span>` : ""}
      <span>${new Date(r.created_at).toLocaleDateString()}</span>
    </div>
  `;

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

async function loadRecommendations() {
  const list = document.getElementById("rec-list");

  const { data: recs, error } = await supabase
    .from("recommendations")
    .select("id, note, link, image_url, is_favorite, created_at, user_id, profiles(username, avatar_url)")
    .eq("request_id", requestId)
    .order("is_favorite", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    list.innerHTML = `<p class="empty-state">Couldn't load recommendations: ${error.message}</p>`;
    return;
  }

  if (!recs.length) {
    list.innerHTML = `<p class="empty-state">No recommendations yet.</p>`;
    return;
  }

  const user = await getCurrentUser();
  const isOwner = user && currentRequest && user.id === currentRequest.user_id;

  list.innerHTML = recs.map(rec => `
    <div class="rec-card ${rec.is_favorite ? "is-favorite" : ""}">
      ${rec.is_favorite ? `<span class="rec-favorite-badge">★ Favorite</span>` : ""}
      ${rec.image_url ? `<div class="rec-image"><img src="${rec.image_url}" alt=""></div>` : ""}
      <p class="rec-note">${escapeHtml(rec.note)}</p>
      ${rec.link ? `<a class="rec-link" href="${escapeHtml(rec.link)}" target="_blank" rel="noopener">${escapeHtml(rec.link)}</a>` : ""}
      <div class="rec-footer">
        <span class="ticket-author">${rec.profiles?.avatar_url ? `<img src="${rec.profiles.avatar_url}" class="mini-avatar">` : `<span class="mini-avatar mini-avatar-empty"></span>`}@${rec.profiles?.username ?? "someone"}</span>
        <span class="rec-actions">
          ${isOwner && !rec.is_favorite ? `<button class="fav-btn" data-id="${rec.id}">Mark favorite</button>` : ""}
          ${user && user.id === rec.user_id ? `<button class="delete-rec-btn" data-id="${rec.id}">Delete</button>` : ""}
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

async function uploadRecImage(user, file) {
  if (!file) return "";
  const path = `${user.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, "_")}`;
  const { error } = await supabase.storage.from("request-images").upload(path, file);
  if (error) throw error;
  const { data } = supabase.storage.from("request-images").getPublicUrl(path);
  return data.publicUrl;
}

function initRecImagePreview() {
  const fileInput = document.getElementById("rec-image-file");
  const preview = document.getElementById("rec-image-preview");
  const labelText = document.getElementById("rec-upload-label-text");
  if (!fileInput) return;

  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (!file) return;
    preview.src = URL.createObjectURL(file);
    preview.style.display = "block";
    labelText.textContent = file.name;
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

  document.getElementById("rec-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const note = document.getElementById("rec-note").value.trim();
    const link = applyAffiliateTag(document.getElementById("rec-link").value.trim());
    const file = document.getElementById("rec-image-file").files[0];

    let image_url = "";
    try {
      image_url = await uploadRecImage(user, file);
    } catch (err) {
      alert("Couldn't upload image: " + err.message);
      return;
    }

    const { error } = await supabase.from("recommendations").insert({
      request_id: requestId,
      user_id: user.id,
      note, link, image_url
    });

    if (error) {
      alert("Couldn't post: " + error.message);
      return;
    }

    e.target.reset();
    document.getElementById("rec-image-preview").style.display = "none";
    document.getElementById("rec-upload-label-text").textContent = "+ Add a photo";
    loadRecommendations();
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

document.addEventListener("DOMContentLoaded", async () => {
  await loadRequest();
  await loadRecommendations();
  initRecForm();
  initPromoteBox();
  initPromoteModalClose();
});
