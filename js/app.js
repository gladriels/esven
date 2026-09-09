let activeCategory = "";
let allRequests = [];
let currentUserId = null;
let currentUserIsAdmin = false;
let likesByRequest = new Map(); // request_id -> Set of user_ids who liked it
let trendingMode = "recent"; // "recent" | "shuffle" | "staffpick"

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// Extract a Spotify track ID from a pasted link, for the mini embed player.
function spotifyEmbedUrl(url) {
  if (!url) return null;
  const match = url.match(/track\/([a-zA-Z0-9]+)/);
  if (!match) return null;
  return `https://open.spotify.com/embed/track/${match[1]}?utm_source=generator&theme=0`;
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

async function loadFeed() {
  const board = document.getElementById("board");
  if (!board) return;
  board.innerHTML = `<p class="feed-loading" role="status">Loading the latest requests...</p>`;

  const requestsQuery = supabase
    .from("requests")
    .select("id, title, description, budget, category, audience, spotify_url, image_url, is_sponsored, is_staff_pick, user_id, created_at, profiles!requests_user_id_fkey(username, avatar_url)")
    .eq("status", "open")
    .order("is_sponsored", { ascending: false })
    .order("created_at", { ascending: false });

  const [{ data: requests, error }, user, { data: likes }] = await Promise.all([
    requestsQuery,
    getCurrentUser(),
    supabase.from("likes").select("request_id, user_id")
  ]);
  currentUserId = user?.id ?? null;
  currentUserIsAdmin = false;

  likesByRequest = new Map();
  (likes ?? []).forEach(({ request_id, user_id }) => {
    if (!likesByRequest.has(request_id)) likesByRequest.set(request_id, new Set());
    likesByRequest.get(request_id).add(user_id);
  });

  if (error) {
    board.innerHTML = `<p class="empty-state">Couldn't load requests. Please refresh and try again.</p>`;
    return;
  }

  allRequests = requests ?? [];
  renderTrending();
  renderFeed();
  renderSectionTiles();

  if (user) {
    const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
    currentUserIsAdmin = profile?.is_admin === true;
    if (currentUserIsAdmin) { renderTrending(); renderFeed(); }
  }
}

function renderSectionTiles() {
  // Cover photos for these tiles are curated static images (see css: .section-him etc,
  // background-image pointing at /images/cover-*.jpg) rather than pulled from posts.
  const groups = { "For Him": "him", "For Her": "her", "Unisex": "unisex" };
  Object.entries(groups).forEach(([audience, slug]) => {
    const inGroup = allRequests.filter(r => r.audience === audience);
    const count = document.getElementById(`count-${slug}`);
    if (count) {
      count.textContent = inGroup.length ? ` · ${inGroup.length}` : "";
    }
  });
}

function applyCategoryFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const cat = params.get("cat");
  if (!cat) return;
  activeCategory = cat;
  document.querySelectorAll(".cat-chip").forEach(c => {
    c.classList.toggle("active", c.dataset.cat === cat);
  });
}

function shuffleArray(list) {
  const arr = list.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function trendingSourceList() {
  const withImages = allRequests.filter(r => r.image_url);
  if (trendingMode === "shuffle") return shuffleArray(withImages).slice(0, 10);
  if (trendingMode === "staffpick") return withImages.filter(r => r.is_staff_pick).slice(0, 10);
  return withImages.slice(0, 10); // "recent" — query already orders by created_at desc
}

function renderTrending() {
  const strip = document.getElementById("trending-strip");
  const heading = document.getElementById("trending-heading");
  const tabs = document.getElementById("trending-tabs");
  if (!strip) return;
  const withImages = allRequests.filter(r => r.image_url);

  if (!withImages.length) {
    strip.style.display = "none";
    heading.style.display = "none";
    if (tabs) tabs.style.display = "none";
    return;
  }
  strip.style.display = "flex";
  heading.style.display = "flex";
  if (tabs) {
    tabs.style.display = "flex";
    tabs.querySelectorAll(".trending-tab").forEach(btn => btn.classList.toggle("active", btn.dataset.mode === trendingMode));
  }

  const items = trendingSourceList();

  if (!items.length) {
    strip.innerHTML = `<p class="empty-state">Nothing here yet.</p>`;
    return;
  }

  strip.innerHTML = items.map(r => {
    const likeCount = likesByRequest.get(r.id)?.size ?? 0;
    const isLiked = currentUserId ? !!likesByRequest.get(r.id)?.has(currentUserId) : false;
    return `
    <a href="request.html#${r.id}" class="trending-card">
      <div class="trending-image">
        <img src="${r.image_url}" alt="">
        ${currentUserIsAdmin ? `<button type="button" class="staff-pick-toggle${r.is_staff_pick ? " is-picked" : ""}" data-id="${r.id}" title="${r.is_staff_pick ? "Remove staff pick" : "Mark as staff pick"}" aria-label="Toggle staff pick">${ICONS.star}</button>` : ""}
        <button type="button" class="like-btn${isLiked ? " is-liked" : ""}" data-id="${r.id}" aria-label="Like">${ICONS.heart}<span class="like-count">${likeCount ? likeCount : ""}</span></button>
      </div>
      <p class="trending-title">${escapeHtml(r.title)}</p>
      <p class="trending-sub">${r.budget ? escapeHtml(r.budget) : (r.category ?? "")}</p>
    </a>
  `;
  }).join("");

  wireLikeButtons(strip);
  wireStaffPickButtons(strip);
}

function initTrendingTabs() {
  const tabs = document.getElementById("trending-tabs");
  if (!tabs) return;
  tabs.addEventListener("click", (e) => {
    const btn = e.target.closest(".trending-tab");
    if (!btn) return;
    trendingMode = btn.dataset.mode;
    renderTrending();
  });
}

async function toggleLike(requestId, btn) {
  const user = await getCurrentUser();
  if (!user) {
    alert("Sign in up top first to like a post.");
    return;
  }
  const likedBy = likesByRequest.get(requestId) ?? new Set();
  const alreadyLiked = likedBy.has(user.id);

  // Optimistic UI update, then reconcile with the server.
  if (alreadyLiked) likedBy.delete(user.id); else likedBy.add(user.id);
  likesByRequest.set(requestId, likedBy);
  paintLikeButton(btn, likedBy, user.id);

  const { error } = alreadyLiked
    ? await supabase.from("likes").delete().eq("request_id", requestId).eq("user_id", user.id)
    : await supabase.from("likes").insert({ request_id: requestId, user_id: user.id });

  if (error) {
    // Roll back on failure.
    if (alreadyLiked) likedBy.add(user.id); else likedBy.delete(user.id);
    likesByRequest.set(requestId, likedBy);
    paintLikeButton(btn, likedBy, user.id);
  }
}

function paintLikeButton(btn, likedBy, userId) {
  const isLiked = likedBy.has(userId);
  btn.classList.toggle("is-liked", isLiked);
  const countEl = btn.querySelector(".like-count");
  if (countEl) countEl.textContent = likedBy.size ? likedBy.size : "";
}

function wireLikeButtons(root) {
  root.querySelectorAll(".like-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleLike(btn.dataset.id, btn);
    });
  });
}

function wireStaffPickButtons(root) {
  root.querySelectorAll(".staff-pick-toggle").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = btn.dataset.id;
      const request = allRequests.find(r => r.id === id);
      if (!request) return;
      const next = !request.is_staff_pick;
      request.is_staff_pick = next;
      btn.classList.toggle("is-picked", next);
      btn.title = next ? "Remove staff pick" : "Mark as staff pick";
      const { error } = await supabase.from("requests").update({ is_staff_pick: next }).eq("id", id);
      if (error) {
        request.is_staff_pick = !next;
        btn.classList.toggle("is-picked", !next);
        alert("Couldn't update staff pick: " + error.message);
      }
    });
  });
}

function renderFeed() {
  const board = document.getElementById("board");
  const filtered = activeCategory
    ? allRequests.filter(r => r.category === activeCategory)
    : allRequests;

  if (!filtered.length) {
    board.innerHTML = `<p class="empty-state">No open requests here yet. Be the first to post one.</p>`;
    return;
  }

  board.innerHTML = filtered.map(r => {
    const likeCount = likesByRequest.get(r.id)?.size ?? 0;
    const isLiked = currentUserId ? !!likesByRequest.get(r.id)?.has(currentUserId) : false;
    return `
    <div class="ticket-wrap">
      <a href="request.html#${r.id}" class="ticket${r.spotify_url ? " has-spotify" : ""}" data-id="${r.id}"${r.spotify_url ? ` data-spotify="${escapeHtml(r.spotify_url)}"` : ""}${r.image_url ? ` style="--post-image: url('${escapeHtml(r.image_url)}')"` : ""}>
        ${r.is_sponsored ? `<span class="sponsored-badge">★ Sponsored</span>` : ""}
        <div class="ticket-image">
          ${r.image_url ? `<img src="${r.image_url}" alt="">` : `<span class="ticket-image-fallback"></span>`}
          ${r.spotify_url ? `<span class="ticket-song-badge" title="Song attached" aria-label="Song attached">${ICONS.music}</span>` : ""}
          <button type="button" class="like-btn${isLiked ? " is-liked" : ""}" data-id="${r.id}" aria-label="Like">${ICONS.heart}<span class="like-count">${likeCount ? likeCount : ""}</span></button>
          <div class="ticket-overlay">
            ${r.category ? `<span class="ticket-cat">${r.category}</span>` : ""}
            <h3 class="ticket-title">${escapeHtml(r.title)}</h3>
          </div>
        </div>
        <div class="ticket-footer">
          <span class="ticket-author">${r.profiles?.avatar_url ? `<img src="${r.profiles.avatar_url}" class="mini-avatar">` : `<span class="mini-avatar mini-avatar-empty"></span>`}@${r.profiles?.username ?? "someone"}</span>
          ${r.budget ? `<span class="ticket-budget">${escapeHtml(r.budget)}</span>` : "<span></span>"}
        </div>
      </a>
      ${r.user_id === currentUserId || currentUserIsAdmin ? `<button class="delete-btn" data-id="${r.id}" title="Delete">&times;</button>` : ""}
    </div>
  `;
  }).join("");

  wireLikeButtons(board);

  document.querySelectorAll(".ticket[data-spotify]").forEach(ticket => {
    ticket.addEventListener("click", () => {
      try {
        sessionStorage.setItem("esven-autoplay-request", ticket.dataset.id);
      } catch (_) {}
    });
  });

  document.querySelectorAll(".delete-btn").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      if (!confirm("Delete this request? This can't be undone.")) return;
      const { error } = await supabase.from("requests").delete().eq("id", btn.dataset.id);
      if (error) { alert("Couldn't delete: " + error.message); return; }
      allRequests = allRequests.filter(r => r.id !== btn.dataset.id);
      renderFeed();
    });
  });

  // trigger reveal animation on next frame so the transition actually fires
  requestAnimationFrame(() => revealOnScroll(".ticket"));
}

function initCategoryRow() {
  const row = document.getElementById("category-row");
  row.addEventListener("click", (e) => {
    const chip = e.target.closest(".cat-chip");
    if (!chip) return;
    row.querySelectorAll(".cat-chip").forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    activeCategory = chip.dataset.cat;
    renderFeed();
  });
}

async function uploadRequestImage(user, file) {
  if (!file) return "";
  const path = `${user.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, "_")}`;
  const { error } = await supabase.storage.from("request-images").upload(path, file);
  if (error) throw error;
  const { data } = supabase.storage.from("request-images").getPublicUrl(path);
  return data.publicUrl;
}

let croppedRequestImage = null;

function openImageCropper(file, onCrop) {
  const source = URL.createObjectURL(file);
  const modal = document.createElement("div");
  modal.className = "image-crop-modal";
  modal.innerHTML = `<div class="image-crop-dialog"><h2>Crop your photo</h2><div class="image-crop-frame"><img src="${source}" alt="Crop preview"></div><div class="image-crop-actions"><button type="button" class="btn btn-ghost" data-crop-cancel>Cancel</button><button type="button" class="btn" data-crop-save>Use photo</button></div></div>`;
  document.body.appendChild(modal);
  const image = modal.querySelector("img");
  image.onload = () => {
    const frame = modal.querySelector(".image-crop-frame");
    const crop = { x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight };
    const ratio = 16 / 10;
    if (crop.width / crop.height > ratio) crop.width = crop.height * ratio;
    else crop.height = crop.width / ratio;
    crop.x = (image.naturalWidth - crop.width) / 2;
    crop.y = (image.naturalHeight - crop.height) / 2;
    modal.querySelector("[data-crop-save]").onclick = () => {
      const canvas = document.createElement("canvas"); canvas.width = 1280; canvas.height = 800;
      canvas.getContext("2d").drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(blob => { onCrop(new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" })); URL.revokeObjectURL(source); modal.remove(); }, "image/jpeg", .9);
    };
    modal.querySelector("[data-crop-cancel]").onclick = () => { URL.revokeObjectURL(source); modal.remove(); };
  };
}

function initImagePreview() {
  const fileInput = document.getElementById("req-image-file");
  const preview = document.getElementById("req-image-preview");
  const labelText = document.getElementById("upload-label-text");
  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0]; if (!file) return;
    openImageCropper(file, cropped => { croppedRequestImage = cropped; preview.src = URL.createObjectURL(cropped); preview.style.display = "block"; labelText.textContent = "Photo cropped"; });
  });
}

async function initNewRequestPanel() {
  const openBtn = document.getElementById("open-request-btn");
  const closeBtn = document.getElementById("close-panel-btn");
  const panel = document.getElementById("new-request-panel");

  const openRequestPanel = async () => {
    const user = await getCurrentUser();
    if (!user) {
      alert("Sign in up top first to post a request.");
      return;
    }
    panel.classList.add("open");
  };
  openBtn.addEventListener("click", openRequestPanel);

  closeBtn.addEventListener("click", () => panel.classList.remove("open"));
  panel.addEventListener("click", (e) => {
    if (e.target === panel) panel.classList.remove("open");
  });

  document.getElementById("request-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const user = await getCurrentUser();
    if (!user) return;

    const title = document.getElementById("req-title").value.trim();
    const description = document.getElementById("req-desc").value.trim();
    const budget = document.getElementById("req-budget").value.trim();
    const category = document.getElementById("req-category").value;
    const audience = document.getElementById("req-audience").value;
    const spotify_url = document.getElementById("req-spotify").value.trim();
    const imageFile = croppedRequestImage || document.getElementById("req-image-file").files[0];

    let image_url = "";
    try {
      image_url = await uploadRequestImage(user, imageFile);
    } catch (err) {
      alert("Couldn't upload image: " + err.message);
      return;
    }

    const { error } = await supabase.from("requests").insert({
      user_id: user.id,
      title, description, budget, category, audience, image_url, spotify_url
    });

    if (error) {
      alert("Couldn't post: " + error.message);
      return;
    }

    e.target.reset();
    panel.classList.remove("open");
    loadFeed();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  applyCategoryFromUrl();
  loadFeed();
  initCategoryRow();
  initTrendingTabs();
  initNewRequestPanel();
  initImagePreview();
});

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("[data-autoplay-audience]").forEach(link => {
    link.addEventListener("click", () => sessionStorage.setItem("esven-autoplay-audience", link.dataset.autoplayAudience));
  });
});
