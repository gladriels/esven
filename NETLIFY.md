# Deploying Glares to Netlify

Glares currently runs on Vercel (`esven-seven.vercel.app`). This repo is now
also set up to deploy to Netlify without changing the frontend at all — the
static site and the API functions in `api/` work unchanged; `netlify.toml`
and `netlify/functions/` are the only additions, and Vercel deployment still
works if you keep it.

## Why Netlify (over Cloudflare Pages or Render)

- **Cloudflare Pages Functions** use a different API (Web-standard
  `Request`/`Response`, no Node `require()`/`Buffer` without extra config),
  so all 6 functions in `api/` would need a real rewrite, not just an
  adapter.
- **Render**'s free tier spins down a Node web service after 15 minutes of
  inactivity, then takes 30-50s to cold-start on the next request. That's a
  real risk for this app specifically: the QPay payment webhook and the
  Supabase message-notification webhook (`net.http_post` from a DB trigger)
  are both time-sensitive server-to-server calls with no user watching a
  loading spinner to explain the delay — a sleeping server could mean a
  missed payment confirmation or a silently-dropped push notification.
- **Netlify** functions run per-invocation like Vercel's (no long
  spin-down), the free tier (125k function calls/month, 100GB bandwidth) is
  comparable to Vercel's, and `netlify/functions/_adapt.js` is a thin
  translation layer — the actual business logic in `api/*.js` is untouched.

## What's already done (in this repo)

- `netlify/functions/_adapt.js` — converts Vercel's `(req, res) => {}`
  function signature to Netlify's `(event) => ({statusCode, body})`, and
  loads each handler lazily inside a try/catch. That last part matters: it's
  what turns a crash like the current push-notification bug (VAPID keys
  missing → `webpush.setVapidDetails()` throws at module load → the whole
  function invocation fails with an opaque platform error) into an ordinary
  JSON 500 you can actually see the message of, instead of a blank failure.
- One tiny wrapper file per function (`netlify/functions/*.js`), each just
  requiring the matching file in `api/` — no logic duplicated.
- `netlify.toml` — rewrites `/api/*` to `/.netlify/functions/*`, so every
  existing `fetch("/api/...")` call in `js/request.js` and `js/profile.js`
  keeps working with no frontend changes.
- Verified locally (see the deploy conversation) that all 6 functions
  return identical responses to what's live on Vercel right now, including
  the missing-QPay-credentials and missing-VAPID-keys error cases.

## What you still need to do (can't be done from here)

1. **Create a Netlify account** (or sign in with GitHub) at
   [netlify.com](https://app.netlify.com) — this has to be you, not me.
2. **"Add new site" → "Import an existing project"** and connect the
   `reqly`/Glares GitHub repo. Leave the build command as `npm install` and
   publish directory as `.` (netlify.toml already has these — Netlify should
   pick them up automatically).
3. **Copy every environment variable from Vercel's dashboard into Netlify's**
   (Site settings → Environment variables). The names Netlify needs, exactly
   as used in `api/*.js`:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `QPAY_CLIENT_ID`, `QPAY_CLIENT_SECRET`, `QPAY_INVOICE_CODE`
     (`QPAY_BASE_URL` is optional — defaults to the sandbox URL)
   - `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` — **this pair must match the
     public key already hardcoded in `js/push-config.js`**
     (`BJDvl...Ie06c`). If you don't have the original private key saved
     anywhere, generating a fresh pair means every device that has already
     subscribed to push notifications stops working until it resubscribes.
   - `MESSAGE_WEBHOOK_SECRET` — must also match the value stored in
     Supabase Vault under the name `message_webhook_secret`
     (`select decrypted_secret from vault.decrypted_secrets where name = 'message_webhook_secret'`)
   - `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`
   - `SITE_URL` — set this to your new Netlify URL (e.g.
     `https://esven.netlify.app`) once you know it; used to build the QPay
     callback URL in `api/create-promotion.js`.
4. **Deploy**, then confirm the new URL works: `/`, then each API route
   (`/api/spotify-search?q=test` is a safe, side-effect-free check).
5. **Point the Supabase → app webhook at the new URL.** The database trigger
   `public.notify_message_webhook()` currently calls
   `https://esven-seven.vercel.app/api/notify-message` (fixed 2026-09-14 —
   it previously pointed at `esven.app`, a domain that isn't registered).
   Once Netlify is confirmed working, update it again:
   ```sql
   create or replace function public.notify_message_webhook()
   returns trigger
   language plpgsql
   security definer
   set search_path = public
   as $$
   declare
     secret text;
   begin
     select decrypted_secret into secret from vault.decrypted_secrets where name = 'message_webhook_secret';
     begin
       perform net.http_post(
         url := 'https://YOUR-NEW-URL/api/notify-message',
         headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', secret),
         body := jsonb_build_object('conversation_id', new.conversation_id, 'sender_id', new.sender_id, 'message_id', new.id, 'body', new.body)
       );
     exception when others then
       null;
     end;
     return new;
   end;
   $$;
   ```
6. If QPay is configured for the Vercel URL specifically (some payment
   providers require whitelisting callback domains in their own dashboard),
   update that too once the new URL is final.
7. Once Netlify is verified, decide whether to keep Vercel running as a
   fallback or disconnect it. Nothing here requires killing Vercel first.
