import { createClient } from "@supabase/supabase-js";
import type { EventStage } from "./event-stage";

// Public anon key — safe to ship in client code. We read from the
// Vite-injected env vars first so the same values used by the backend
// GitHub Actions can be shared without drift, then fall back to the
// hardcoded published-project defaults so the site keeps working if the
// env vars are ever unset.
const SUPABASE_URL =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ??
  "https://ldpwajisioljyjtojvfx.supabase.co";
const SUPABASE_ANON_KEY =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ??
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ??
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
  stage: EventStage | string;
  severity: number;
  confidence: number;
  delta: number;
  published_at: string;
  created_at: string;
  resolution_at: string | null;
  market_created?: boolean | null;
  market_threshold?: number | null;
  market_resolved?: boolean | null;
  market_address?: string | null;
  ai_processed?: boolean | null;
  ai_tentative_winner?: "HAWK" | "DOVE" | string | null;
  ai_resolved_at?: string | null;
};