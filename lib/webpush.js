// Web Push on Cloudflare's runtime.
//
// The web-push library does two jobs: encrypting the notification and signing
// the VAPID header, then sending it with Node's https.request. The first part
// runs fine on Workers — checked by decrypting its output with the
// subscription's own key. The second does not: https.request isn't
// implemented there ("[unenv] https.request is not implemented yet"), so
// every sendNotification() call would fail. So the library only builds the
// request, and the runtime's own fetch sends it.
import webpush from "web-push";

export function configureVapid(env) {
  webpush.setVapidDetails("mailto:jessveine@gmail.com", env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
}

// Resolves on a 2xx from the push service. Otherwise throws an error carrying
// statusCode, same shape as web-push's own WebPushError, so callers can treat
// 404/410 as "this subscription is gone".
export async function sendWebPush(subscription, payload) {
  const details = webpush.generateRequestDetails(subscription, payload);
  const headers = { ...details.headers };
  delete headers["Content-Length"]; // fetch sets it from the body
  const res = await fetch(details.endpoint, {
    method: details.method,
    headers,
    body: details.body
  });
  if (res.status < 200 || res.status > 299) {
    const err = new Error(`Push service responded ${res.status}`);
    err.statusCode = res.status;
    err.body = await res.text().catch(() => "");
    throw err;
  }
  return { statusCode: res.status };
}
