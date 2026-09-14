// Gets a QPay access token using the merchant credentials. Credentials live
// only in Cloudflare's encrypted environment variables — never in the repo,
// never sent to the browser.
import { basicCredentials } from "./http.js";

export function qpayBaseUrl(env) {
  return env.QPAY_BASE_URL || "https://merchant-sandbox.qpay.mn/v2";
}

export async function getQpayToken(env) {
  const clientId = env.QPAY_CLIENT_ID;
  const clientSecret = env.QPAY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("QPay credentials not configured (QPAY_CLIENT_ID / QPAY_CLIENT_SECRET missing).");
  }

  const res = await fetch(`${qpayBaseUrl(env)}/auth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicCredentials(clientId, clientSecret)}`,
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
