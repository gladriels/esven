import { json, readJson } from "../../lib/http.js";
import { getQpayToken, qpayBaseUrl } from "../../lib/qpay.js";

// Flat price to promote a listing, in MNT.
const PROMOTION_PRICE_MNT = 5000;

export async function onRequest({ request, env }) {
  if (request.method !== "POST") return json(405, { error: "Method not allowed" });

  const { requestId } = await readJson(request);
  if (!requestId) return json(400, { error: "requestId is required" });

  try {
    const token = await getQpayToken(env);
    const invoiceCode = env.QPAY_INVOICE_CODE;
    if (!invoiceCode) throw new Error("QPAY_INVOICE_CODE not configured.");

    // QPay calls back to wherever this site is actually being served from,
    // unless SITE_URL pins it — so the callback follows the host automatically.
    const siteUrl = env.SITE_URL || new URL(request.url).origin;

    const invoiceRes = await fetch(`${qpayBaseUrl(env)}/invoice`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        invoice_code: invoiceCode,
        sender_invoice_no: `${requestId}-${Date.now()}`,
        invoice_receiver_code: "esven-user",
        invoice_description: `Promote listing ${requestId}`,
        amount: PROMOTION_PRICE_MNT,
        callback_url: `${siteUrl}/api/qpay-webhook?requestId=${requestId}`
      })
    });

    if (!invoiceRes.ok) {
      const text = await invoiceRes.text();
      throw new Error(`QPay invoice creation failed: ${invoiceRes.status} ${text}`);
    }

    const invoice = await invoiceRes.json();
    return json(200, {
      invoiceId: invoice.invoice_id,
      qrImage: invoice.qr_image,   // base64 PNG
      qrText: invoice.qr_text,
      urls: invoice.urls || [],
      amount: PROMOTION_PRICE_MNT
    });
  } catch (err) {
    return json(500, { error: err.message });
  }
}
