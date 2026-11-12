
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "تنظیمات Supabase پیدا نشد. فایل .env.local را بررسی کنید."
  );
}

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey
);
