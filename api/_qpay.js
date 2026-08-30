// Shared helper: gets a QPay access token using your merchant credentials.
// Credentials live only in Vercel's environment variables — never in the
// git repo, never sent to the browser. See README for setup.

const QPAY_BASE_URL = process.env.QPAY_BASE_URL || "https://merchant-sandbox.qpay.mn/v2";

async function getQpayToken() {
  const clientId = process.env.QPAY_CLIENT_ID;
  const clientSecret = process.env.QPAY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("QPay credentials not configured (QPAY_CLIENT_ID / QPAY_CLIENT_SECRET missing).");
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const res = await fetch(`${QPAY_BASE_URL}/auth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/json"
    }
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`QPay auth failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  return data.access_token;
}

module.exports = { getQpayToken, QPAY_BASE_URL };
