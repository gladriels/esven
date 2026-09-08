// Publishable values only. The service-role key must never be shipped to the browser.
const SUPABASE_URL = window.ESVEN_SUPABASE_URL || "https://zrlrbucvnadnxsoqtgfd.supabase.co";
const SUPABASE_ANON_KEY = window.ESVEN_SUPABASE_KEY || "sb_publishable_mPMSWsHc3fjjRRqyQbEeqA_i_XxbvYi";

window.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
