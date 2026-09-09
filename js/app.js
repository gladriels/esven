let activeCategory = "";
let allRequests = [];
let currentUserId = null;
let currentUserIsAdmin = false;
let likesByRequest = new Map(); // request_id -> Set of user_ids who liked it
let feedMode = "staffpick"; // "shuffle" | "staffpick" | "recent" — shared by the feed and the trending strip

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
    .select("id, title, description, budget, category, audience, spotify_url, image_url, is_sponsored, is_staff_pick, staff_pick_rank, user_id, created_at, profiles!requests_user_id_fkey(username, avatar_url)")
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
  if (feedMode === "shuffle") return shuffleArray(withImages).slice(0, 10);
  if (feedMode === "staffpick") {
    const picked = withImages.filter(r => r.is_staff_pick).sort((a, b) => (a.staff_pick_rank ?? 0) - (b.staff_pick_rank ?? 0));
    const rest = withImages.filter(r => !r.is_staff_pick);
    return [...picked, ...rest].slice(0, 10);
  }
  if (feedMode === "recent") {
    const viewedIds = getRecentlyViewedIds();
    const byId = new Map(withImages.map(r => [r.id, r]));
    return viewedIds.map(id => byId.get(id)).filter(Boolean).slice(0, 10);
  }
  return withImages.slice(0, 10);
}

function renderTrending() {
  const strip = document.getElementById("trending-strip");
  const heading = document.getElementById("trending-heading");
  if (!strip) return;
  const withImages = allRequests.filter(r => r.image_url);

  if (!withImages.length) {
    strip.style.display = "none";
    heading.style.display = "none";
    return;
  }
  strip.style.display = "flex";
  heading.style.display = "flex";

  const items = trendingSourceList();

  if (!items.length) {
    strip.innerHTML = `<p class="empty-state">Nothing here yet.</p>`;
    return;
  }

  const showReorder = feedMode === "staffpick" && currentUserIsAdmin;

  strip.innerHTML = items.map((r, i) => {
    const likeCount = likesByRequest.get(r.id)?.size ?? 0;
    const isLiked = currentUserId ? !!likesByRequest.get(r.id)?.has(currentUserId) : false;
    return `
    <a href="request.html#${r.id}" class="trending-card" data-id="${r.id}">
      <div class="trending-image">
        <img src="${r.image_url}" alt="">
        ${currentUserIsAdmin ? `<button type="button" class="staff-pick-toggle${r.is_staff_pick ? " is-picked" : ""}" data-id="${r.id}" title="${r.is_staff_pick ? "Remove staff pick" : "Mark as staff pick"}" aria-label="Toggle staff pick">${ICONS.star}</button>` : ""}
        <button type="button" class="like-btn${isLiked ? " is-liked" : ""}" data-id="${r.id}" aria-label="Like">${ICONS.heart}<span class="like-count">${likeCount ? likeCount : ""}</span></button>
        ${showReorder ? `
          <div class="reorder-btns">
            <button type="button" class="reorder-btn" data-swap-with="${items[i - 1]?.id ?? ""}" ${i === 0 ? "disabled" : ""} title="Move earlier" aria-label="Move earlier">&uarr;</button>
            <button type="button" class="reorder-btn" data-swap-with="${items[i + 1]?.id ?? ""}" ${i === items.length - 1 ? "disabled" : ""} title="Move later" aria-label="Move later">&darr;</button>
          </div>
        ` : ""}
      </div>
      <p class="trending-title">${escapeHtml(r.title)}</p>
      <p class="trending-sub">${r.budget ? escapeHtml(r.budget) : (r.category ?? "")}</p>
    </a>
  `;
  }).join("");

  wireLikeButtons(strip);
  wireStaffPickButtons(strip);

  if (showReorder) {
    strip.querySelectorAll(".reorder-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const id = btn.closest(".trending-card").dataset.id;
        const otherId = btn.dataset.swapWith;
        if (!otherId) return;
        swapStaffPickRank(id, otherId);
      });
    });
  }
}

function feedSourceList() {
  if (feedMode === "shuffle") return shuffleArray(allRequests);
  if (feedMode === "staffpick") {
    // Staff picks lead, in the admin's chosen order; everything else
    // follows after so the feed is never empty and admins can still find
    // (and star) posts that aren't picked yet.
    const picked = allRequests.filter(r => r.is_staff_pick).sort((a, b) => (a.staff_pick_rank ?? 0) - (b.staff_pick_rank ?? 0));
    const rest = allRequests.filter(r => !r.is_staff_pick);
    return [...picked, ...rest];
  }
  if (feedMode === "recent") {
    const viewedIds = getRecentlyViewedIds();
    const byId = new Map(allRequests.map(r => [r.id, r]));
    return viewedIds.map(id => byId.get(id)).filter(Boolean);
  }
  return allRequests;
}

function initFeedTabs() {
  const tabs = document.querySelectorAll("#feed-tabs");
  tabs.forEach(row => {
    row.addEventListener("click", (e) => {
      const btn = e.target.closest(".feed-tab");
      if (!btn) return;
      feedMode = btn.dataset.mode;
      document.querySelectorAll("#feed-tabs .feed-tab").forEach(b => b.classList.toggle("active", b.dataset.mode === feedMode));
      renderFeed();
      renderTrending();
    });
  });
}

function renderStaffPickViews() {
  renderTrending();
  renderFeed();
}

async function swapStaffPickRank(idA, idB) {
  const a = allRequests.find(r => r.id === idA);
  const b = allRequests.find(r => r.id === idB);
  if (!a || !b) return;
  const rankA = a.staff_pick_rank, rankB = b.staff_pick_rank;
  a.staff_pick_rank = rankB;
  b.staff_pick_rank = rankA;
  renderStaffPickViews();
  const [{ error: errA }, { error: errB }] = await Promise.all([
    supabase.from("requests").update({ staff_pick_rank: rankB }).eq("id", idA),
    supabase.from("requests").update({ staff_pick_rank: rankA }).eq("id", idB)
  ]);
  if (errA || errB) {
    a.staff_pick_rank = rankA;
    b.staff_pick_rank = rankB;
    renderStaffPickViews();
    alert("Couldn't reorder staff picks.");
  }
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
      const prevRank = request.staff_pick_rank;
      const nextRank = next ? (Math.max(0, ...allRequests.map(r => r.staff_pick_rank ?? 0)) + 1) : null;
      request.is_staff_pick = next;
      request.staff_pick_rank = nextRank;
      btn.classList.toggle("is-picked", next);
      btn.title = next ? "Remove staff pick" : "Mark as staff pick";
      const { error } = await supabase.from("requests").update({ is_staff_pick: next, staff_pick_rank: nextRank }).eq("id", id);
      if (error) {
        request.is_staff_pick = !next;
        request.staff_pick_rank = prevRank;
        btn.classList.toggle("is-picked", !next);
        alert("Couldn't update staff pick: " + error.message);
      }
    });
  });
}

function renderFeed() {
  const board = document.getElementById("board");
  const base = feedSourceList();
  const filtered = activeCategory
    ? base.filter(r => r.category === activeCategory)
    : base;

  if (!filtered.length) {
    const emptyMessages = {
      recent: "You haven't viewed any posts yet — browse Shuffle or Staff Picks to get started.",
    };
    board.innerHTML = `<p class="empty-state">${emptyMessages[feedMode] ?? "No open requests here yet. Be the first to post one."}</p>`;
    return;
  }

  const showReorder = feedMode === "staffpick" && currentUserIsAdmin;

  board.innerHTML = filtered.map((r, i) => {
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
          <span class="ticket-author">${r.profiles?.avatar_url ? `<img src="${r.profiles.avatar_url}" class="mini-avatar">` : `<span class="mini-avatar mini-avatar-empty"></span>`}${r.profiles?.username ?? "someone"}</span>
          ${r.budget ? `<span class="ticket-budget">${escapeHtml(r.budget)}</span>` : "<span></span>"}
        </div>
      </a>
      ${r.user_id === currentUserId || currentUserIsAdmin ? `<button class="delete-btn" data-id="${r.id}" title="Delete">&times;</button>` : ""}
      ${showReorder ? `
        <div class="reorder-btns">
          <button type="button" class="reorder-btn" data-swap-with="${filtered[i - 1]?.id ?? ""}" ${i === 0 ? "disabled" : ""} title="Move earlier" aria-label="Move earlier">&uarr;</button>
          <button type="button" class="reorder-btn" data-swap-with="${filtered[i + 1]?.id ?? ""}" ${i === filtered.length - 1 ? "disabled" : ""} title="Move later" aria-label="Move later">&darr;</button>
        </div>
      ` : ""}
    </div>
  `;
  }).join("");

  wireLikeButtons(board);

  if (showReorder) {
    board.querySelectorAll(".reorder-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const wrap = btn.closest(".ticket-wrap");
        const id = wrap.querySelector(".ticket").dataset.id;
        const otherId = btn.dataset.swapWith;
        if (!otherId) return;
        swapStaffPickRank(id, otherId);
      });
    });
  }

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

// No forced crop/aspect-ratio any more — people post whatever shape photo
// they want. The only gate is a minimum size, so tiny/blurry images don't
// end up in the feed.
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

function initImagePreview() {
  const fileInput = document.getElementById("req-image-file");
  const preview = document.getElementById("req-image-preview");
  const labelText = document.getElementById("upload-label-text");
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
    const imageFile = document.getElementById("req-image-file").files[0];

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
  initFeedTabs();
  initNewRequestPanel();
  initImagePreview();
});

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("[data-autoplay-audience]").forEach(link => {
    link.addEventListener("click", () => sessionStorage.setItem("esven-autoplay-audience", link.dataset.autoplayAudience));
  });
});
