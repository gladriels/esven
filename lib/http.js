// Small helpers shared by the Cloudflare Pages Functions in functions/api/.
// Cloudflare runs these on its Workers runtime: handlers get a web-standard
// Request and return a Response, and secrets arrive on `env` rather than
// process.env.

export function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

// Same leniency the Vercel functions had: a missing or malformed JSON body
// is treated as an empty object, and the handler's own checks report what's
// missing.
export async function readJson(request) {
  try {
    return await request.json();
  } catch (_) {
    return {};
  }
}

// HTTP Basic credentials. The Vercel versions used Node's Buffer; btoa is the
// runtime-native equivalent (client ids and secrets are plain ASCII).
export function basicCredentials(id, secret) {
  return btoa(`${id}:${secret}`);
}
