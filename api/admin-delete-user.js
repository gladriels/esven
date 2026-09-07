const { createClient } = require("@supabase/supabase-js");

module.exports = async (req, res) => {
  if (req.method !== "DELETE") return res.status(405).json({ error: "Method not allowed" });
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  const targetUserId = req.body?.userId;
  if (!token || !targetUserId) return res.status(400).json({ error: "A signed-in admin and userId are required" });
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: "Supabase server configuration is missing" });
  }

  const adminClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: { user }, error: authError } = await adminClient.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: "Sign in again" });
  if (user.id === targetUserId) return res.status(400).json({ error: "Admins cannot remove their own account here" });
  const { data: adminProfile } = await adminClient.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
  if (!adminProfile?.is_admin) return res.status(403).json({ error: "Administrator access required" });

  const { error } = await adminClient.auth.admin.deleteUser(targetUserId);
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ ok: true });
};
