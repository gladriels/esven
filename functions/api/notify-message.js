// Sends a Web Push notification when a direct message arrives. Called by a
// Postgres trigger (pg_net) with a shared secret, not by browsers.
import { json, readJson } from "../../lib/http.js";
import { configureVapid, sendWebPush } from "../../lib/webpush.js";
import { adminClient } from "../../lib/supabase.js";

export async function onRequest({ request, env }) {
  if (request.method !== "POST") return json(405, { error: "Method not allowed" });

  const providedSecret = request.headers.get("x-webhook-secret");
  if (!providedSecret || providedSecret !== env.MESSAGE_WEBHOOK_SECRET) {
    return json(401, { error: "Invalid webhook secret" });
  }

  const { conversation_id, sender_id, body } = await readJson(request);
  if (!conversation_id || !sender_id) return json(400, { error: "conversation_id and sender_id are required" });

  try {
    // Set per request, inside the try: on Vercel this ran at module load, so
    // missing VAPID keys crashed every call before it could say why. Here a
    // bad key comes back as a readable 500.
    configureVapid(env);
    const supabase = adminClient(env);

    const { data: conversation } = await supabase
      .from("conversations")
      .select("user_min, user_max")
      .eq("id", conversation_id)
      .single();
    if (!conversation) return json(200, { ok: true, note: "conversation not found" });

    const recipientId = conversation.user_min === sender_id ? conversation.user_max : conversation.user_min;

    const [{ data: sender }, { data: subscriptions }] = await Promise.all([
      supabase.from("profiles").select("username").eq("id", sender_id).single(),
      supabase.from("push_subscriptions").select("id, endpoint, p256dh, auth_key").eq("user_id", recipientId)
    ]);

    if (!subscriptions?.length) return json(200, { ok: true, note: "recipient has no subscriptions" });

    const payload = JSON.stringify({
      title: `@${sender?.username ?? "Someone"} messaged you`,
      body: (body || "").slice(0, 140),
      conversationId: conversation_id
    });

    const results = await Promise.allSettled(
      subscriptions.map((sub) =>
        sendWebPush(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
          payload
        ).catch((err) => {
          if (err.statusCode === 404 || err.statusCode === 410) {
            return supabase.from("push_subscriptions").delete().eq("id", sub.id);
          }
          throw err;
        })
      )
    );

    return json(200, { ok: true, sent: results.length });
  } catch (err) {
    return json(500, { error: err.message });
  }
}
