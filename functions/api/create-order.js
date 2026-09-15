import { json, readJson } from "../../lib/http.js";
import { getQpayToken, qpayBaseUrl } from "../../lib/qpay.js";
import { adminClient } from "../../lib/supabase.js";

// Price and stock are looked up here, server-side, rather than trusted from
// the client — the browser only ever sends a product id and a quantity, so
// there's no request field a buyer could edit to pay less or route around
// a sold-out item.
export async function onRequest({ request, env }) {
  if (request.method !== "POST") return json(405, { error: "Method not allowed" });

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return json(401, { error: "Sign in to buy something" });

  const { productId, size, quantity, contactPhone, shippingAddress } = await readJson(request);
  const qty = Number.isInteger(quantity) && quantity > 0 ? quantity : 1;
  if (!productId) return json(400, { error: "productId is required" });
  if (!contactPhone || !shippingAddress) {
    return json(400, { error: "A phone number and delivery address are required" });
  }

  let admin;
  try {
    admin = adminClient(env);
  } catch (err) {
    return json(500, { error: err.message });
  }

  const { data: { user }, error: authError } = await admin.auth.getUser(token);
  if (authError || !user) return json(401, { error: "Sign in again" });

  const { data: product, error: productError } = await admin
    .from("products")
    .select("id, name, price_mnt, sizes, stock_count, is_active")
    .eq("id", productId)
    .maybeSingle();
  if (productError) return json(500, { error: productError.message });
  if (!product || !product.is_active) return json(404, { error: "This item isn't available" });
  if (product.stock_count !== null && product.stock_count < qty) {
    return json(409, { error: "Not enough stock left" });
  }
  if (product.sizes?.length && !product.sizes.includes(size)) {
    return json(400, { error: "Pick a size" });
  }

  const total = product.price_mnt * qty;

  const { data: order, error: orderError } = await admin
    .from("orders")
    .insert({
      user_id: user.id,
      product_id: product.id,
      size: product.sizes?.length ? size : null,
      quantity: qty,
      price_mnt: product.price_mnt,
      total_mnt: total,
      contact_phone: contactPhone,
      shipping_address: shippingAddress,
      status: "pending"
    })
    .select("id")
    .single();
  if (orderError) return json(500, { error: orderError.message });

  try {
    const qpayToken = await getQpayToken(env);
    const invoiceCode = env.QPAY_INVOICE_CODE;
    if (!invoiceCode) throw new Error("QPAY_INVOICE_CODE not configured.");

    const siteUrl = env.SITE_URL || new URL(request.url).origin;

    const invoiceRes = await fetch(`${qpayBaseUrl(env)}/invoice`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${qpayToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        invoice_code: invoiceCode,
        sender_invoice_no: `${order.id}-${Date.now()}`,
        invoice_receiver_code: "glares-customer",
        invoice_description: `${product.name} x${qty}`,
        amount: total,
        callback_url: `${siteUrl}/api/order-webhook?orderId=${order.id}`
      })
    });

    if (!invoiceRes.ok) {
      const text = await invoiceRes.text();
      throw new Error(`QPay invoice creation failed: ${invoiceRes.status} ${text}`);
    }

    const invoice = await invoiceRes.json();
    await admin.from("orders").update({ qpay_invoice_id: invoice.invoice_id }).eq("id", order.id);

    return json(200, {
      orderId: order.id,
      invoiceId: invoice.invoice_id,
      qrImage: invoice.qr_image,
      qrText: invoice.qr_text,
      urls: invoice.urls || [],
      amount: total
    });
  } catch (err) {
    // The order row stays as a record even if QPay failed, but there's no
    // point leaving it "pending" forever with no invoice behind it.
    await admin.from("orders").update({ status: "cancelled" }).eq("id", order.id);
    return json(500, { error: err.message });
  }
}
