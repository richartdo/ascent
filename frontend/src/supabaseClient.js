import { createClient } from '@supabase/supabase-js';

let supabaseInstance = null;

export function getSupabase() {
  if (supabaseInstance) return supabaseInstance;

  // Try loading from localStorage
  const url = localStorage.getItem('supabase_url') || import.meta.env.VITE_SUPABASE_URL || '';
  const key = localStorage.getItem('supabase_anon_key') || import.meta.env.VITE_SUPABASE_ANON_KEY || '';

  if (url && key) {
    try {
      supabaseInstance = createClient(url, key, {
        auth: {
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: true
        }
      });
    } catch (e) {
      console.error('Failed to initialize Supabase client:', e);
    }
  }

  return supabaseInstance;
}

export function initializeSupabase(url, key) {
  if (!url || !key) {
    supabaseInstance = null;
    localStorage.removeItem('supabase_url');
    localStorage.removeItem('supabase_anon_key');
    return null;
  }

  localStorage.setItem('supabase_url', url);
  localStorage.setItem('supabase_anon_key', key);

  try {
    supabaseInstance = createClient(url, key, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
      }
    });
  } catch (e) {
    console.error('Failed to initialize Supabase client:', e);
    supabaseInstance = null;
    throw e;
  }

  return supabaseInstance;
}
