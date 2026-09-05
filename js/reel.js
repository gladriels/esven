const audience = decodeURIComponent(window.location.hash.slice(1));
let reelRequests = [];
let activeReelCategory = "";
let spotifyIframeApi = null;
const controllers = {}; // requestId -> EmbedController
let currentlyPlayingId = null;

document.getElementById("reel-title").textContent = audience || "Browse";

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function spotifyTrackUri(url) {
  if (!url) return null;
  const match = url.match(/track\/([a-zA-Z0-9]+)/);
  if (!match) return null;
  return `spotify:track:${match[1]}`;
}

// Spotify's official embed API — this is what lets play() fire programmatically
// after the person's tap, instead of relying on plain iframe autoplay (which
// browsers block).
window.onSpotifyIframeApiReady = (IFrameAPI) => {
  spotifyIframeApi = IFrameAPI;
};

async function loadReel() {
  const container = document.getElementById("reel-container");

  let query = supabase
    .from("requests")
    .select("id, title, description, budget, category, audience, image_url, spotify_url, created_at, profiles(username)")
    .eq("status", "open")
    .order("created_at", { ascending: false });

  if (audience) query = query.eq("audience", audience);

  const { data, error } = await query;

  if (error) {
    container.innerHTML = `<p class="empty-state" style="color:#fff;">Couldn't load: ${error.message}</p>`;
    return;
  }

  reelRequests = data;
  renderReel();
}

function renderReel() {
  const container = document.getElementById("reel-container");
  const items = activeReelCategory
    ? reelRequests.filter(r => r.category === activeReelCategory)
    : reelRequests;

  if (!items.length) {
    container.innerHTML = `<p class="empty-state" style="color:#fff;">Nothing here yet.</p>`;
    return;
  }

  container.innerHTML = `
    <div class="reel-cat-row">
      <button class="cat-chip reel-chip ${!activeReelCategory ? "active" : ""}" data-cat="">All</button>
      ${[...new Set(reelRequests.map(r => r.category).filter(Boolean))].map(c => `
        <button class="cat-chip reel-chip ${activeReelCategory === c ? "active" : ""}" data-cat="${c}">${c}</button>
      `).join("")}
    </div>
  ` + items.map(r => `
    <section class="reel-section" data-id="${r.id}" style="${r.image_url ? `background-image:url('${r.image_url}')` : ""}">
      <div class="reel-overlay">
        ${r.category ? `<span class="ticket-cat">${r.category}</span>` : ""}
        <h2 class="reel-item-title">${escapeHtml(r.title)}</h2>
        <p class="reel-item-desc">${escapeHtml(r.description ?? "")}</p>
        <div class="reel-item-footer">
          <span>@${r.profiles?.username ?? "someone"}</span>
          ${r.budget ? `<span class="ticket-budget">${escapeHtml(r.budget)}</span>` : ""}
        </div>
        ${r.spotify_url ? `<div class="reel-spotify" id="spotify-${r.id}" data-uri="${spotifyTrackUri(r.spotify_url)}"></div>` : ""}
      </div>
    </section>
  `).join("");

  document.querySelectorAll(".reel-section").forEach(section => {
    section.addEventListener("click", () => playReelItem(section.dataset.id));
  });

  document.querySelector(".reel-cat-row").addEventListener("click", (e) => {
    const chip = e.target.closest(".cat-chip");
    if (!chip) return;
    activeReelCategory = chip.dataset.cat;
    renderReel();
  });

  initReelObserver();
}

function ensureController(requestId, uri, callback) {
  if (controllers[requestId]) {
    callback(controllers[requestId]);
    return;
  }
  if (!spotifyIframeApi) {
    // API script not ready yet — retry shortly
    setTimeout(() => ensureController(requestId, uri, callback), 300);
    return;
  }
  const el = document.getElementById(`spotify-${requestId}`);
  if (!el) return;
  spotifyIframeApi.createController(el, { uri, width: "100%", height: "80" }, (controller) => {
    controllers[requestId] = controller;
    callback(controller);
  });
}

function playReelItem(requestId) {
  const el = document.getElementById(`spotify-${requestId}`);
  if (!el) return; // no song attached
  const uri = el.dataset.uri;
  if (!uri) return;

  if (currentlyPlayingId && currentlyPlayingId !== requestId && controllers[currentlyPlayingId]) {
    controllers[currentlyPlayingId].pause();
  }

  ensureController(requestId, uri, (controller) => {
    controller.play();
    currentlyPlayingId = requestId;
  });
}

function pauseReelItem(requestId) {
  if (controllers[requestId]) controllers[requestId].pause();
}

function initReelObserver() {
  const sections = document.querySelectorAll(".reel-section");
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      const id = entry.target.dataset.id;
      if (entry.isIntersecting && entry.intersectionRatio > 0.6) {
        playReelItem(id);
      } else {
        pauseReelItem(id);
      }
    });
  }, { threshold: [0.6] });

  sections.forEach(s => observer.observe(s));
}

document.addEventListener("DOMContentLoaded", loadReel);
