import { json, readJson } from "../../lib/http.js";
import { getQpayToken, qpayBaseUrl } from "../../lib/qpay.js";
import { adminClient } from "../../lib/supabase.js";

export async function onRequest({ request, env }) {
  const orderId = new URL(request.url).searchParams.get("orderId");
  if (!orderId) return json(400, { error: "orderId is required" });

  try {
    // QPay's callback just says "something happened" — verify with QPay
    // directly rather than trusting the ping.
    const token = await getQpayToken(env);
    const body = request.method === "GET" ? {} : await readJson(request);
    const paymentId = body.payment_id || body.object_id;

    if (paymentId) {
      const checkRes = await fetch(`${qpayBaseUrl(env)}/payment/${paymentId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const payment = await checkRes.json();
      if (payment.payment_status !== "PAID") {
        return json(200, { ok: true, note: "payment not confirmed yet" });
      }
    }

    const admin = adminClient(env);

    // Only ever move a *pending* order to paid, and only once — this update
    // returning zero rows (order already paid, or never existed) means the
    // stock decrement below is skipped too, so a retried webhook can't take
    // stock twice for the same order.
    const { data: updated, error: updateError } = await admin
      .from("orders")
      .update({ status: "paid" })
      .eq("id", orderId)
      .eq("status", "pending")
      .select("id, product_id, quantity")
      .maybeSingle();
    if (updateError) throw updateError;

    if (updated) {
      const { data: product } = await admin
        .from("products")
        .select("stock_count")
        .eq("id", updated.product_id)
        .maybeSingle();
      if (product && product.stock_count !== null) {
        await admin
          .from("products")
          .update({ stock_count: Math.max(0, product.stock_count - updated.quantity) })
          .eq("id", updated.product_id);
      }
    }

    return json(200, { ok: true });
  } catch (err) {
    return json(500, { error: err.message });
  }
}
