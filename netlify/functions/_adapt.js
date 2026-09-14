// Netlify Functions use a different call signature than Vercel's — an
// `(event, context) => { statusCode, body }` shape instead of Vercel's
// Express-style `(req, res) => {}`. Rather than rewriting the six functions
// in ../../api (and risking a slip in business logic — QPay auth, admin
// checks, push notifications), this translates one call convention into the
// other. The original api/*.js files are unchanged and still work if you
// deploy them to Vercel too.
//
// `loadHandler` is a function (usually `() => require("../../api/x")`)
// rather than the handler itself, and is called inside the try/catch below.
// That matters for exactly one file: api/notify-message.js calls
// `webpush.setVapidDetails()` at module scope, which throws if the VAPID
// keys aren't configured — that's the actual cause of every push
// notification silently crashing in production (see the deploy notes). A
// plain `require()` at the top of this file would let that same crash take
// down the whole function again before the handler even runs; loading it
// lazily, inside the try/catch, turns that into an ordinary JSON 500
// instead of an opaque platform-level failure.
function toNetlifyHandler(loadHandler) {
  return async (event) => {
    let parsedBody = {};
    if (event.body) {
      const raw = event.isBase64Encoded
        ? Buffer.from(event.body, "base64").toString("utf8")
        : event.body;
      try { parsedBody = JSON.parse(raw); } catch (_) { parsedBody = {}; }
    }

    const req = {
      method: event.httpMethod,
      headers: event.headers || {},
      query: event.queryStringParameters || {},
      body: parsedBody
    };

    let statusCode = 200;
    let responseBody = "";
    const headers = { "Content-Type": "application/json" };

    const res = {
      status(code) { statusCode = code; return res; },
      json(payload) { responseBody = JSON.stringify(payload); return res; },
      setHeader(key, value) { headers[key] = value; return res; },
      end(payload) { if (payload !== undefined) responseBody = payload; return res; }
    };

    try {
      const vercelHandler = loadHandler();
      await vercelHandler(req, res);
    } catch (err) {
      // A Vercel function that throws crashes the whole invocation (see
      // api/notify-message.js — that's the exact failure mode that turned
      // out to be silently breaking push notifications). Catch it here so a
      // bug in one handler comes back as a normal 500 JSON response instead
      // of an opaque platform-level failure.
      statusCode = 500;
      responseBody = JSON.stringify({ error: err.message || "Internal error" });
    }

    return { statusCode, headers, body: responseBody };
  };
}

module.exports = { toNetlifyHandler };
