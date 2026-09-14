import { json } from "../../lib/http.js";
import { adminClient } from "../../lib/supabase.js";

export async function onRequest({ request, env }) {
  const requestId = new URL(request.url).searchParams.get("requestId");
  if (!requestId) return json(400, { error: "requestId is required" });

  try {
    const { data, error } = await adminClient(env)
      .from("requests")
      .select("is_sponsored")
      .eq("id", requestId)
      .single();

    if (error) return json(500, { error: error.message });
    return json(200, { isSponsored: data.is_sponsored === true });
  } catch (err) {
    return json(500, { error: err.message });
  }
}
