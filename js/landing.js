function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

async function loadStats() {
  const [{ count: requestCount }, { count: recCount }, { count: memberCount }] = await Promise.all([
    supabase.from("requests").select("*", { count: "exact", head: true }).eq("status", "open"),
    supabase.from("recommendations").select("*", { count: "exact", head: true }),
    supabase.from("profiles").select("*", { count: "exact", head: true })
  ]);

  document.getElementById("stat-requests").textContent = requestCount ?? 0;
  document.getElementById("stat-recs").textContent = recCount ?? 0;
  document.getElementById("stat-members").textContent = memberCount ?? 0;
}

async function loadSolved() {
  const grid = document.getElementById("solved-grid");

  // "Solved" = a request that has at least one favorited recommendation.
  const { data: favRecs, error } = await supabase
    .from("recommendations")
    .select("request_id, requests(id, title, image_url, profiles(username))")
    .eq("is_favorite", true)
    .limit(12);

  if (error) {
    grid.innerHTML = `<p class="empty-state">Couldn't load: ${error.message}</p>`;
    return;
  }

  const solved = favRecs.map(f => f.requests).filter(Boolean);

  if (!solved.length) {
    grid.innerHTML = `<p class="empty-state">Nothing marked solved yet — be the first.</p>`;
    return;
  }

  grid.innerHTML = solved.map(r => `
    <a href="request.html#${r.id}" class="solved-card">
      ${r.image_url
        ? `<img src="${r.image_url}" alt="" class="solved-thumb">`
        : `<div class="solved-thumb solved-thumb-empty"></div>`}
      <p class="solved-title">${escapeHtml(r.title)}</p>
      <p class="solved-sub">@${r.profiles?.username ?? "someone"}</p>
    </a>
  `).join("");
}

let activeShopCategory = "";

async function renderShopGrid() {
  const grid = document.getElementById("shop-grid");
  if (!grid) return;

  const { data: items, error } = await supabase
    .from("requests")
    .select("id, title, category, budget, image_url, created_at")
    .eq("status", "open")
    .not("image_url", "eq", "")
    .order("created_at", { ascending: false })
    .limit(12);

  if (error || !items || !items.length) {
    grid.innerHTML = `<p class="empty-state">Nothing to show yet.</p>`;
    return;
  }

  window.__shopItems = items;
  paintShopGrid();
}

function paintShopGrid() {
  const grid = document.getElementById("shop-grid");
  const items = window.__shopItems || [];
  const filtered = activeShopCategory ? items.filter(r => r.category === activeShopCategory) : items;

  if (!filtered.length) {
    grid.innerHTML = `<p class="empty-state">Nothing in this category yet.</p>`;
    return;
  }

  grid.innerHTML = filtered.map(r => `
    <a href="request.html#${r.id}" class="shop-card">
      <div class="shop-card-image" style="background-image:url('${r.image_url}')">
        <span class="shop-heart">&#9825;</span>
        <span class="shop-overlay"><span class="shop-cta">Recommend</span></span>
      </div>
      <p class="shop-title">${escapeHtml(r.title)}</p>
      <p class="shop-price">${escapeHtml(r.budget || r.category || "")}</p>
    </a>
  `).join("");
}

document.addEventListener("DOMContentLoaded", () => {
  loadStats();
  loadSolved();
  renderShopGrid();
  const row = document.getElementById("shop-filter-row");
  if (row) {
    row.addEventListener("click", (e) => {
      const chip = e.target.closest(".filter-chip");
      if (!chip) return;
      row.querySelectorAll(".filter-chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      activeShopCategory = chip.dataset.cat;
      paintShopGrid();
    });
  }
});
