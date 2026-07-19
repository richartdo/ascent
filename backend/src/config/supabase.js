import { createClient } from "@supabase/supabase-js";

import { env } from "./env.js";

export const assertSupabaseConfiguration = () => {
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY are required for authenticated routes.",
    );
  }
};

export const createUserSupabaseClient = (accessToken) => {
  assertSupabaseConfiguration();

  return createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
};
