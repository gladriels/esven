// Public Supabase project configuration. The publishable key is safe to expose.
const SUPABASE_URL = "https://zrlrbucvnadnxsoqtgfd.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_mPMSWsHc3fjjRRqyQbEeqA_i_XxbvYi";

window.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: "esven-auth"
  }
});
