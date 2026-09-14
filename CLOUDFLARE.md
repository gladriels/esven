# Hosting Glares on Cloudflare Pages

Glares is moving off Vercel to **Cloudflare Pages**, on the free plan.

## Why Cloudflare Pages

Checked against the providers' own documentation in September 2026:

- **Pages and images are free and unlimited** — requests for static files
  don't count toward any quota.
- **500 builds a month.** Every push to GitHub is one build; that's plenty
  even on a busy day of changes.
- **Server functions** (Spotify search, promotions, the QPay webhook, message
  notifications, account removal) share the Workers free allowance of
  **100,000 requests a day**. Glares uses a tiny fraction of that, and going
  over only affects those functions for the rest of that UTC day — the site
  itself keeps serving.
- No credit card needed.

**Not Netlify:** its free plan is now credit-based — 300 credits a month,
15 per production deploy — and when credits run out *every* site on the
account is paused behind a "Site not available" page. There was also a known
2026 bug pausing free sites that still had credits. The Netlify setup this
repo used to carry has been removed.

## What's in the repo

| Path | Purpose |
|---|---|
| `functions/api/*.js` | The six server functions, in Cloudflare's format. Same routes as before (`/api/spotify-search` etc.), so the site's code is unchanged. |
| `lib/` | Helpers shared by those functions (Supabase client, QPay token, Web Push). Not published. |
| `scripts/build-site.mjs` | Copies only the public site (HTML, `css/`, `js/`, `images/`, `sw.js`) into `dist/`. |
| `wrangler.toml` | Tells Cloudflare to publish `dist/` and enables Node compatibility for the push library. |
| `api/` | The old Vercel versions. Keep until the switch is confirmed, then delete. |

Two things work differently from Vercel, both handled:

- **Only `dist/` is published.** Cloudflare serves whatever folder it's pointed
  at, so the repo root would have exposed `api/`, `lib/`, migrations and
  `node_modules`. Unknown paths return the homepage instead.
- **Push notifications send with `fetch`.** The `web-push` library sends with
  Node's `https.request`, which Cloudflare's runtime doesn't implement. The
  library still builds and encrypts the notification; `lib/webpush.js` sends it.

Cloudflare also drops `.html` from addresses: `/request.html` redirects to
`/request`, keeping the `?query` (browsers keep the `#fragment`), so existing
links and the Instagram bio link keep working.

## Verified locally in Cloudflare's runtime (wrangler 4.131, workerd 2026-09-11)

- All five pages load at their new addresses.
- Server source, migrations, `node_modules` and local secrets files are not
  served — each returns the homepage, byte-for-byte.
- All six functions return the same responses as the Vercel versions for bad
  input, wrong methods and missing configuration; Spotify search reached
  Spotify for real.
- Push notifications: the encrypted payload decrypts back to the exact text
  with the subscription's own key, the VAPID signature is ES256, and real HTTPS
  sends reached Google's and Mozilla's push services (they answered 410/404
  for made-up tokens — the codes that clean up dead subscriptions).

Secrets used in testing were throwaway values; no real keys were involved.

## What you need to do

These need your Cloudflare account and your secret values, so they can't be
done from here.

1. **Create a free Cloudflare account** at https://dash.cloudflare.com/sign-up.
2. **Workers & Pages → Create → Pages → Connect to Git**, and pick the
   `gladriels/esven` GitHub repo.
3. **Build settings:**
   - Framework preset: **None**
   - Build command: `node scripts/build-site.mjs`
   - Build output directory: `dist`
4. **Settings → Variables and Secrets**, add each as a **Secret**, copying
   the values from Vercel (Project → Settings → Environment Variables):
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
   - `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`
   - `MESSAGE_WEBHOOK_SECRET` — must match the Supabase Vault secret
     `message_webhook_secret`
   - `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` — the public key must match the one
     in `js/push-config.js`
   - Optional: `QPAY_CLIENT_ID`, `QPAY_CLIENT_SECRET`, `QPAY_INVOICE_CODE`,
     `QPAY_BASE_URL`. `SITE_URL` is optional too: the QPay callback now uses
     whatever address the site is served from.
5. **Deployments → Retry deployment** so the secrets take effect, then note
   the address it gives you (like `glares.pages.dev`).
6. **Supabase → Authentication → URL Configuration:** set the Site URL to the
   new address and add it to the allowed redirect URLs, or sign-up
   confirmation and password-reset emails will point back at Vercel.
7. **Tell Claude the new address** to repoint the database's
   message-notification webhook (`public.notify_message_webhook()`), which
   currently calls the Vercel address.
8. **Update the Instagram bio link** to `https://<your-address>` (the plain address — the site no longer auto-scrolls to the feed, so there's nothing to append).
9. ~~Category cover images~~ — done: the five covers were copied from Vercel's
   file storage into `images/`, so nothing on the site depends on Vercel.
10. Once everything checks out, the Vercel project and the `api/` folder can go.
