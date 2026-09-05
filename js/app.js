let activeCategory = "";
let allRequests = [];
let currentUserId = null;

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
    .select("id, title, description, budget, category, audience, spotify_url, image_url, is_sponsored, user_id, created_at, profiles(username, avatar_url)")
    .eq("status", "open")
    .order("is_sponsored", { ascending: false })
    .order("created_at", { ascending: false });

  const [{ data: requests, error }, { data: { user } }] = await Promise.all([
    requestsQuery,
    supabase.auth.getUser()
  ]);
  currentUserId = user?.id ?? null;

  if (error) {
    board.innerHTML = `<p class="empty-state">Couldn't load requests. Please refresh and try again.</p>`;
    return;
  }

  allRequests = requests ?? [];
  renderTrending();
  renderFeed();
  renderSectionTiles();
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

function renderTrending() {
  const strip = document.getElementById("trending-strip");
  const heading = document.getElementById("trending-heading");
  if (!strip) return;
  const withImages = allRequests.filter(r => r.image_url).slice(0, 10);

  if (!withImages.length) {
    strip.style.display = "none";
    heading.style.display = "none";
    return;
  }
  strip.style.display = "flex";
  heading.style.display = "flex";

  strip.innerHTML = withImages.map(r => `
    <a href="request.html#${r.id}" class="trending-card">
      <div class="trending-image"><img src="${r.image_url}" alt=""></div>
      <p class="trending-title">${escapeHtml(r.title)}</p>
      <p class="trending-sub">${r.budget ? escapeHtml(r.budget) : (r.category ?? "")}</p>
    </a>
  `).join("");
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

  board.innerHTML = filtered.map(r => `
    <div class="ticket-wrap">
      <a href="request.html#${r.id}" class="ticket${r.spotify_url ? " has-spotify" : ""}" data-id="${r.id}"${r.spotify_url ? ` data-spotify="${escapeHtml(r.spotify_url)}"` : ""}>
        ${r.is_sponsored ? `<span class="sponsored-badge">★ Sponsored</span>` : ""}
        ${r.image_url ? `<div class="ticket-image"><img src="${r.image_url}" alt=""></div>` : ""}
        ${r.category ? `<span class="ticket-cat">${r.category}</span>` : ""}
        <h3 class="ticket-title">${escapeHtml(r.title)}</h3>
        <p class="ticket-desc">${escapeHtml(r.description ?? "")}</p>
        ${r.spotify_url ? `<div class="ticket-song">&#9834; song attached</div>` : ""}
        <div class="ticket-footer">
          <span class="ticket-author">${r.profiles?.avatar_url ? `<img src="${r.profiles.avatar_url}" class="mini-avatar">` : `<span class="mini-avatar mini-avatar-empty"></span>`}@${r.profiles?.username ?? "someone"}</span>
          ${r.budget ? `<span class="ticket-budget">${escapeHtml(r.budget)}</span>` : "<span></span>"}
        </div>
      </a>
      ${r.user_id === currentUserId ? `<button class="delete-btn" data-id="${r.id}" title="Delete">&times;</button>` : ""}
    </div>
  `).join("");

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

function initImagePreview() {
  const fileInput = document.getElementById("req-image-file");
  const preview = document.getElementById("req-image-preview");
  const labelText = document.getElementById("upload-label-text");

  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (!file) return;
    preview.src = URL.createObjectURL(file);
    preview.style.display = "block";
    labelText.textContent = file.name;
  });
}

async function initNewRequestPanel() {
  const openBtn = document.getElementById("open-request-btn");
  const closeBtn = document.getElementById("close-panel-btn");
  const panel = document.getElementById("new-request-panel");

  openBtn.addEventListener("click", async () => {
    const user = await getCurrentUser();
    if (!user) {
      alert("Sign in up top first to post a request.");
      return;
    }
    panel.classList.add("open");
  });

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
  initNewRequestPanel();
  initImagePreview();
});
