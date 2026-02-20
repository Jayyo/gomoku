// Supabase configuration
const SUPABASE_URL = 'https://ldobmbqcewrdxygxemwl.supabase.co';
const SUPABASE_KEY = 'sb_publishable_snhHMveO4OgzyIIv0xD-wQ_SmZIWJE3';

const { createClient } = window.supabase || window.Supabase || {};
const db = createClient(SUPABASE_URL, SUPABASE_KEY);
