import { createClient } from "@supabase/supabase-js";
import type { EventStage } from "./event-stage";

// Public browser reads must stay on the authoritative Geomacro data project.
// A stale/mismatched Lovable VITE_* environment previously pointed the client
// at an empty Cloud database, which made GRI/intelligence appear unavailable.
// Accept VITE_* overrides only when they target the authoritative project;
// otherwise fall back to the known public project pair.
const AUTHORITATIVE_SUPABASE_PROJECT_REF = "ldpwajisioljyjtojvfx";
const AUTHORITATIVE_SUPABASE_URL =
  `https://${AUTHORITATIVE_SUPABASE_PROJECT_REF}.supabase.co`;
const AUTHORITATIVE_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJIUzI1NiIsInJlZiI6ImxkcHdhamlzaW9sanlqdG9qdmZ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2NjUxNTcsImV4cCI6MjA5NzI0MTE1N30.Hm2LwUWuuyA2O28_woD9m0MJCrV-o48SUKOk5FHANNI";

const configuredUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const configuredAnonKey =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ??
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined);

const configuredTargetsAuthoritativeProject = Boolean(
  configuredUrl?.includes(AUTHORITATIVE_SUPABASE_PROJECT_REF),
);

const SUPABASE_URL = configuredTargetsAuthoritativeProject
  ? configuredUrl!
  : AUTHORITATIVE_SUPABASE_URL;
const SUPABASE_ANON_KEY =
  configuredTargetsAuthoritativeProject && configuredAnonKey
    ? configuredAnonKey
    : AUTHORITATIVE_SUPABASE_ANON_KEY;

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
