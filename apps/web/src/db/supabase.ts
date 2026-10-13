import { createClient } from "@supabase/supabase-js";

/**
 * The URL and publishable key are meant to be public: every row is guarded
 * by row-level security keyed on the signed-in email (allowed_users, see
 * supabase/migrations). Nothing here is a secret.
 */
export const SUPABASE_URL = "https://lomsjeahhiyforjnwbtu.supabase.co";
export const SUPABASE_KEY = "sb_publishable_NsjbgFbhXREOzCjhJjHPzg_Z7nw_vBA";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
