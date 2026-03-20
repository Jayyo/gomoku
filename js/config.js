// Supabase configuration
const SUPABASE_URL = 'https://spjyuqxnxpbfofichnpi.supabase.co';
const SUPABASE_KEY = 'sb_publishable_ayafJKOzvB3L6fqehyqw1w_RiB1XJjI';

// Single source of truth for local mode detection
const isLocalMode = new URLSearchParams(window.location.search).get('mode') === 'local';

// Initialize Supabase client (skip in local play mode)
let db = null;
if (!isLocalMode) {
  const supabaseLib = window.supabase || window.Supabase || {};
  if (supabaseLib.createClient) {
    db = supabaseLib.createClient(SUPABASE_URL, SUPABASE_KEY);
  }
}
window.db = db;
