const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async (req, res) => {
  const requestId = req.query.requestId;
  if (!requestId) {
    res.status(400).json({ error: "requestId is required" });
    return;
  }

  const { data, error } = await supabase
    .from("requests")
    .select("is_sponsored")
    .eq("id", requestId)
    .single();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.status(200).json({ isSponsored: data.is_sponsored === true });
};
