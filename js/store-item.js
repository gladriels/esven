// Single product page + checkout. The QPay QR/poll flow mirrors the
// "Promote this listing" flow in request.js — same provider, same shape —
// except payment status is polled by reading the order row directly via
// Supabase (RLS already lets a user read their own orders) rather than a
// dedicated check-* endpoint.

const productId = window.location.hash.slice(1);
let currentProduct = null;
let selectedSize = null;

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function formatPrice(mnt) {
  return `${Number(mnt).toLocaleString()}₮`;
}

async function loadProduct() {
  const detail = document.getElementById("product-detail");
  if (!productId) {
    detail.innerHTML = `<p class="empty-state">No product specified.</p>`;
    return;
  }

  const { data: p, error } = await supabase
    .from("products")
    .select("id, name, description, price_mnt, image_url, image_width, image_height, sizes, stock_count, is_active")
    .eq("id", productId)
    .maybeSingle();

  if (error || !p) {
    detail.innerHTML = `<p class="empty-state">Product not found.</p>`;
    return;
  }

  currentProduct = p;
  const soldOut = p.stock_count !== null && p.stock_count <= 0;
  const dims = p.image_width && p.image_height ? ` width="${p.image_width}" height="${p.image_height}"` : "";

  detail.innerHTML = `
    ${p.image_url ? `<div class="product-detail-image"><img src="${p.image_url}" alt=""${dims} decoding="async"></div>` : ""}
    <h1>${escapeHtml(p.name)}</h1>
    <p class="product-detail-price">${formatPrice(p.price_mnt)}</p>
    ${soldOut ? `<span class="product-sold-out-badge">Sold out</span>` : ""}
    ${p.description ? `<p>${escapeHtml(p.description)}</p>` : ""}
    ${p.sizes?.length ? `<div class="size-row" id="size-row">${p.sizes.map(s => `<button type="button" class="size-chip" data-size="${escapeHtml(s)}">${escapeHtml(s)}</button>`).join("")}</div>` : ""}
    <div class="field-row">
      <input type="number" id="buy-quantity" min="1" value="1" style="max-width:100px" ${soldOut ? "disabled" : ""} />
      <button type="button" class="btn" id="buy-now-btn" ${soldOut ? "disabled" : ""}>${soldOut ? "Sold out" : "Buy now"}</button>
    </div>
  `;

  const sizeRow = document.getElementById("size-row");
  if (sizeRow) {
    sizeRow.addEventListener("click", (e) => {
      const chip = e.target.closest(".size-chip");
      if (!chip) return;
      sizeRow.querySelectorAll(".size-chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      selectedSize = chip.dataset.size;
    });
  }

  const buyBtn = document.getElementById("buy-now-btn");
  if (buyBtn) buyBtn.addEventListener("click", startCheckout);
}

async function startCheckout() {
  const user = await getCurrentUser();
  if (!user) { alert("Sign in up top first to buy something."); return; }
  if (currentProduct.sizes?.length && !selectedSize) { alert("Pick a size first."); return; }

  const quantity = Math.max(1, parseInt(document.getElementById("buy-quantity").value, 10) || 1);
  const modal = document.getElementById("checkout-modal");
  const body = document.getElementById("checkout-modal-body");
  modal.classList.add("open");

  body.innerHTML = `
    <form id="checkout-contact-form">
      <div class="field-row">
        <input type="tel" id="checkout-phone" placeholder="Phone number" required />
      </div>
      <div class="field-row">
        <textarea id="checkout-address" placeholder="Delivery address" required></textarea>
      </div>
      <p class="field-hint">${quantity} × ${escapeHtml(currentProduct.name)}${selectedSize ? ` (${escapeHtml(selectedSize)})` : ""} — ${formatPrice(currentProduct.price_mnt * quantity)}</p>
      <button type="submit" class="btn">Continue to payment</button>
    </form>
  `;

  document.getElementById("checkout-contact-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const submitBtn = e.target.querySelector("button[type=submit]");
    submitBtn.disabled = true;
    submitBtn.textContent = "Creating payment...";
    body.querySelector(".field-hint")?.remove();

    const contactPhone = document.getElementById("checkout-phone").value.trim();
    const shippingAddress = document.getElementById("checkout-address").value.trim();

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ productId: currentProduct.id, size: selectedSize, quantity, contactPhone, shippingAddress })
      });
      const data = await res.json();
      if (!res.ok) {
        body.innerHTML = `<p class="empty-state">Couldn't start payment: ${escapeHtml(data.error || "unknown error")}</p>`;
        return;
      }

      body.innerHTML = `
        <p style="text-align:center; margin-bottom:14px;">Scan with any Mongolian banking app — ${formatPrice(data.amount)}</p>
        <img src="data:image/png;base64,${data.qrImage}" alt="QPay QR code" style="width:220px; display:block; margin:0 auto 14px;" />
        <p class="empty-state" id="order-status">Waiting for payment...</p>
      `;
      pollOrderStatus(data.orderId);
    } catch (err) {
      body.innerHTML = `<p class="empty-state">Couldn't start payment: ${escapeHtml(err.message)}</p>`;
    }
  });
}

function pollOrderStatus(orderId) {
  const statusEl = document.getElementById("order-status");
  const interval = setInterval(async () => {
    try {
      const { data } = await supabase.from("orders").select("status").eq("id", orderId).maybeSingle();
      if (data?.status === "paid") {
        clearInterval(interval);
        if (statusEl) statusEl.textContent = "Payment received — thank you! We'll be in touch to arrange delivery.";
      } else if (data?.status === "cancelled") {
        clearInterval(interval);
        if (statusEl) statusEl.textContent = "This payment was cancelled. Close this and try again.";
      }
    } catch (_) {
      // keep polling silently
    }
  }, 3000);
}

function initCheckoutModalClose() {
  document.getElementById("checkout-close-btn").addEventListener("click", () => {
    document.getElementById("checkout-modal").classList.remove("open");
  });
}

document.addEventListener("DOMContentLoaded", () => {
  loadProduct();
  initCheckoutModalClose();
});
