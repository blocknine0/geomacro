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
  source_domain?: string | null;
  category: string;
  narrative: string;
  summary: string;
  stage: EventStage | string;
  severity: number;
  confidence: number;
  delta: number;
  classification_provider?: string | null;
  classification_model?: string | null;
  classification_version?: string | null;
  classification_prompt_version?: string | null;
  classification_scored_at?: string | null;
  classification_input_hash?: string | null;
  published_at: string;
  created_at: string;
  resolution_at: string | null;
  market_created?: boolean | null;
  market_threshold?: number | null;
  market_resolved?: boolean | null;
  market_address?: string | null;
  ai_processed?: boolean | null;
  ai_tentative_winner?: "HAWK" | "DOVE" | string | null;
  /** Reasoning written by the backend resolver alongside ai_tentative_winner. */
  ai_reasoning?: string | null;
  ai_resolved_at?: string | null;
  lifecycle_stage?: "active" | "awaiting_dispute" | "disputed" | "completed" | string | null;
  disputer_address?: string | null;
  dispute_window_ends_at?: string | null;
  /** Pre-generated analyst briefing (written once by the scheduled backend
   *  script). The frontend never generates these live. */
  hawk_reasoning?: string | null;
  dove_reasoning?: string | null;
  hawk_conviction?: number | null;
  dove_conviction?: number | null;
  briefing_generated_at?: string | null;
  /** Explicit human-readable market question written by the publisher.
   *  When present it overrides the auto-generated severity template. */
  market_question?: string | null;
};
