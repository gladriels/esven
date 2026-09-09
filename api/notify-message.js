const { createClient } = require("@supabase/supabase-js");
const webpush = require("web-push");

// This runs with the Supabase SERVICE ROLE key, which bypasses row-level
// security — that's necessary here since this is a trusted server call
// (triggered by a Postgres trigger via pg_net), not a user action. Never
// expose this key to the browser.
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

webpush.setVapidDetails(
  "mailto:jessveine@gmail.com",
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const providedSecret = req.headers["x-webhook-secret"];
  if (!providedSecret || providedSecret !== process.env.MESSAGE_WEBHOOK_SECRET) {
    return res.status(401).json({ error: "Invalid webhook secret" });
  }

  const { conversation_id, sender_id, body } = req.body || {};
  if (!conversation_id || !sender_id) return res.status(400).json({ error: "conversation_id and sender_id are required" });

  try {
    const { data: conversation } = await supabase
      .from("conversations")
      .select("user_min, user_max")
      .eq("id", conversation_id)
      .single();
    if (!conversation) return res.status(200).json({ ok: true, note: "conversation not found" });

    const recipientId = conversation.user_min === sender_id ? conversation.user_max : conversation.user_min;

    const [{ data: sender }, { data: subscriptions }] = await Promise.all([
      supabase.from("profiles").select("username").eq("id", sender_id).single(),
      supabase.from("push_subscriptions").select("id, endpoint, p256dh, auth_key").eq("user_id", recipientId)
    ]);

    if (!subscriptions?.length) return res.status(200).json({ ok: true, note: "recipient has no subscriptions" });

    const payload = JSON.stringify({
      title: `@${sender?.username ?? "Someone"} messaged you`,
      body: (body || "").slice(0, 140),
      conversationId: conversation_id
    });

    const results = await Promise.allSettled(
      subscriptions.map((sub) =>
        webpush.sendNotification(
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

    res.status(200).json({ ok: true, sent: results.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
