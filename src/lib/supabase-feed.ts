import { createClient } from "@supabase/supabase-js";

// Public anon key — safe to ship in client code.
const SUPABASE_URL = "https://ldpwajisioljyjtojvfx.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkcHdhamlzaW9sanlqdG9qdmZ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2NjUxNTcsImV4cCI6MjA5NzI0MTE1N30.Hm2LwUWuuyA2O28_woD9m0MJCrV-o48SUKOk5FHANNI";

export const supabaseFeed = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export type StoredEventRow = {
  id: string;
  source_url: string;
  source_title: string;
  source_name: string | null;
  category: string;
  narrative: string;
  summary: string;
  stage: string;
  severity: number;
  confidence: number;
  delta: number;
  published_at: string;
  created_at: string;
};