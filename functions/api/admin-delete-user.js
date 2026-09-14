import { json, readJson } from "../../lib/http.js";
import { adminClient } from "../../lib/supabase.js";

export async function onRequest({ request, env }) {
  if (request.method !== "DELETE") return json(405, { error: "Method not allowed" });

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const { userId: targetUserId } = await readJson(request);
  if (!token || !targetUserId) return json(400, { error: "A signed-in admin and userId are required" });

  let admin;
  try {
    admin = adminClient(env);
  } catch (err) {
    return json(500, { error: err.message });
  }

  const { data: { user }, error: authError } = await admin.auth.getUser(token);
  if (authError || !user) return json(401, { error: "Sign in again" });
  if (user.id === targetUserId) return json(400, { error: "Admins cannot remove their own account here" });

  const { data: adminProfile } = await admin.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
  if (!adminProfile?.is_admin) return json(403, { error: "Administrator access required" });

  const { error } = await admin.auth.admin.deleteUser(targetUserId);
  if (error) return json(500, { error: error.message });
  return json(200, { ok: true });
}
