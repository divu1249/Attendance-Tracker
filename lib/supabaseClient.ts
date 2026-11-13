import { createClient } from '@supabase/supabase-js';

function normalizeSupabaseUrl(url?: string): string {
  const fallback = 'https://mcqffjdncqhahzoowgrk.supabase.co';
  if (!url) return fallback;
  const match = url.match(/^https?:\/\/supabase\.com\/([a-z0-9-]+)\/?$/i);
  if (match) {
    return `https://${match[1]}.supabase.co`;
  }
  return url;
}

const supabaseUrl = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'sb_publishable_5_EkoaVXUp3s_X6I6BDmwA_8ZyRi3G3';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);