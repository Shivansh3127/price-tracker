// backend/src/db/supabase.js
// Initialises the Supabase admin client (service role).
// The service role key bypasses Row Level Security, so it must
// NEVER be exposed to the frontend or public.

'use strict';

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  throw new Error(
    'Missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables. ' +
    'Copy backend/.env.example to backend/.env and fill in your values.'
  );
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

module.exports = supabase;
