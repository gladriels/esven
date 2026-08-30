const { createClient } = require("@supabase/supabase-js");
const { getQpayToken, QPAY_BASE_URL } = require("./_qpay");

// This runs with the Supabase SERVICE ROLE key, which bypasses row-level
// security — that's necessary here since this is a trusted server call, not
// a user action. Never expose this key to the browser.
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

  try {
    // QPay's callback just tells us "something happened" — we still verify
    // the actual payment status ourselves rather than trusting the ping blindly.
    const token = await getQpayToken();
    const body = req.body || {};
    const paymentId = body.payment_id || body.object_id;

    if (paymentId) {
      const checkRes = await fetch(`${QPAY_BASE_URL}/payment/${paymentId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const payment = await checkRes.json();

      if (payment.payment_status !== "PAID") {
        res.status(200).json({ ok: true, note: "payment not confirmed yet" });
        return;
      }
    }

    const { error } = await supabase
      .from("requests")
      .update({ is_sponsored: true })
      .eq("id", requestId);

    if (error) throw error;

    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
