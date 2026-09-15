// Store grid — official Glares merch, separate from the reverse-marketplace
// feed. Products are written directly by admins (RLS restricts writes to
// is_admin, same pattern as staff-pick moderation elsewhere); buying one
// goes through the create-order Cloudflare function so price and stock are
// checked server-side, not trusted from the browser.

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function formatPrice(mnt) {
  return `${Number(mnt).toLocaleString()}₮`;
}

async function loadStoreGrid() {
  const grid = document.getElementById("store-grid");

  const [{ data: products, error }, profile] = await Promise.all([
    supabase.from("products").select("id, name, price_mnt, image_url, stock_count, is_active")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false }),
    getMyProfile()
  ]);

  const isAdmin = profile?.is_admin === true;
  const addBtn = document.getElementById("admin-add-product-btn");
  if (isAdmin && addBtn) addBtn.style.display = "inline-flex";

  if (error) {
    grid.innerHTML = `<p class="empty-state">Couldn't load the store: ${escapeHtml(error.message)}</p>`;
    return;
  }

  // Admins see inactive products too (RLS allows it), so they can still spot
  // and manage them — but the public grid only shows what's actually on sale.
  const visible = isAdmin ? products : (products ?? []).filter(p => p.is_active);

  if (!visible?.length) {
    grid.innerHTML = `<p class="empty-state">Nothing in the store yet.</p>`;
    return;
  }

  grid.innerHTML = visible.map(p => {
    const soldOut = p.stock_count !== null && p.stock_count <= 0;
    return `
    <a href="store-item.html#${p.id}" class="product-card">
      <div class="product-card-image">
        ${p.image_url ? `<img src="${p.image_url}" alt="${escapeHtml(p.name)}" loading="lazy" decoding="async">` : ""}
        ${soldOut ? `<div class="product-card-soldout">Sold out</div>` : ""}
        ${isAdmin && !p.is_active ? `<div class="product-card-soldout">Hidden</div>` : ""}
      </div>
      <p class="product-card-name">${escapeHtml(p.name)}</p>
      <p class="product-card-price">${formatPrice(p.price_mnt)}</p>
    </a>`;
  }).join("");
}

function initAddProductPanel() {
  const openBtn = document.getElementById("admin-add-product-btn");
  const closeBtn = document.getElementById("close-add-product-btn");
  const panel = document.getElementById("add-product-panel");
  if (!openBtn) return;

  openBtn.addEventListener("click", () => panel.classList.add("open"));
  closeBtn.addEventListener("click", () => panel.classList.remove("open"));
  panel.addEventListener("click", (e) => { if (e.target === panel) panel.classList.remove("open"); });

  const fileInput = document.getElementById("prod-image-file");
  const preview = document.getElementById("prod-image-preview");
  const labelText = document.getElementById("prod-upload-label-text");
  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (!file) return;
    preview.src = URL.createObjectURL(file);
    preview.style.display = "block";
    labelText.textContent = "Photo selected";
  });

  let isSubmitting = false;
  document.getElementById("add-product-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    isSubmitting = true;

    const submitBtn = e.target.querySelector("button[type=submit]");
    const label = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = "Adding...";

    try {
      const name = document.getElementById("prod-name").value.trim();
      const description = document.getElementById("prod-desc").value.trim();
      const price_mnt = parseInt(document.getElementById("prod-price").value, 10);
      const stockRaw = document.getElementById("prod-stock").value.trim();
      const stock_count = stockRaw ? parseInt(stockRaw, 10) : null;
      const sizesRaw = document.getElementById("prod-sizes").value.trim();
      const sizes = sizesRaw ? sizesRaw.split(",").map(s => s.trim()).filter(Boolean) : null;
      const file = fileInput.files[0];

      if (!file) { alert("Add a photo."); return; }
      if (!name || !price_mnt) { alert("Name and price are required."); return; }

      let image_url = "", image_width = null, image_height = null;
      try {
        const uploaded = await prepareImageForUpload(file);
        const path = `products/${Date.now()}-${uploaded.name.replace(/[^a-zA-Z0-9.]/g, "_")}`;
        const { error: uploadError } = await supabase.storage.from("request-images").upload(path, uploaded.blob);
        if (uploadError) throw uploadError;
        const { data } = supabase.storage.from("request-images").getPublicUrl(path);
        image_url = data.publicUrl;
        image_width = uploaded.width;
        image_height = uploaded.height;
      } catch (err) {
        alert("Couldn't upload the photo: " + err.message);
        return;
      }

      const { error } = await supabase.from("products").insert({
        name, description, price_mnt, stock_count, sizes, image_url, image_width, image_height
      });
      if (error) { alert("Couldn't add product: " + error.message); return; }

      e.target.reset();
      preview.style.display = "none";
      labelText.textContent = "+ Add a photo";
      panel.classList.remove("open");
      loadStoreGrid();
    } finally {
      isSubmitting = false;
      submitBtn.disabled = false;
      submitBtn.textContent = label;
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  loadStoreGrid();
  initAddProductPanel();
});
