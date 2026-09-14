// Public VAPID key for Web Push subscriptions. Safe to ship to the browser —
// only the matching private key (server-side only) can sign push messages.
//
// Regenerated 2026-09-15: the original private key was never configured on
// any host, so the notify-message function crashed on every call and push
// never actually worked in production. The old public key is retired along
// with it — the 2 existing rows in push_subscriptions were signed against
// that dead key and can't be reused; they'll be replaced next time those
// devices' subscriptions naturally refresh or someone re-enables push.
window.ESVEN_VAPID_PUBLIC_KEY = "BMjU5EbtpjqEOAooCELVsT2dq0-u8zUuGQ29n7UV4Bze-rP_jpRsOODi4Weeq09g1tf5REWgrv-2ZTts1Iw1OvQ";
