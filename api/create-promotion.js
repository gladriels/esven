const { getQpayToken, QPAY_BASE_URL } = require("./_qpay");

// Flat price to promote a listing, in MNT. Change this to whatever you want to charge.
const PROMOTION_PRICE_MNT = 5000;

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { requestId } = req.body || {};
  if (!requestId) {
    res.status(400).json({ error: "requestId is required" });
    return;
  }

  try {
    const token = await getQpayToken();
    const invoiceCode = process.env.QPAY_INVOICE_CODE;
    if (!invoiceCode) throw new Error("QPAY_INVOICE_CODE not configured.");

    const siteUrl = process.env.SITE_URL || "https://esven-seven.vercel.app";

    const invoiceRes = await fetch(`${QPAY_BASE_URL}/invoice`, {
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

    res.status(200).json({
      invoiceId: invoice.invoice_id,
      qrImage: invoice.qr_image,   // base64 PNG
      qrText: invoice.qr_text,
      urls: invoice.urls || [],
      amount: PROMOTION_PRICE_MNT
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
