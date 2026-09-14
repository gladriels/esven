import { json, readJson } from "../../lib/http.js";
import { getQpayToken, qpayBaseUrl } from "../../lib/qpay.js";
import { adminClient } from "../../lib/supabase.js";

export async function onRequest({ request, env }) {
  const requestId = new URL(request.url).searchParams.get("requestId");
  if (!requestId) return json(400, { error: "requestId is required" });

  try {
    // QPay's callback just says "something happened" — the payment status is
    // still checked with QPay rather than trusting the ping.
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

    const { error } = await adminClient(env)
      .from("requests")
      .update({ is_sponsored: true })
      .eq("id", requestId);
    if (error) throw error;

    return json(200, { ok: true });
  } catch (err) {
    return json(500, { error: err.message });
  }
}
