import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) ||
  (typeof process !== 'undefined' && process.env?.VITE_SUPABASE_URL) ||
  'https://pvsnnktyoaplwjbvqfos.supabase.co';

const supabaseAnonKey =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY) ||
  (typeof process !== 'undefined' && process.env?.VITE_SUPABASE_ANON_KEY) ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB2c25ua3R5b2FwbHdqYnZxZm9zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU4NTM0NTksImV4cCI6MjEwMTQyOTQ1OX0.uzpFIWIJgT6GJfnec_uGbVWNymrag-P0ajSx2kp27kY';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);