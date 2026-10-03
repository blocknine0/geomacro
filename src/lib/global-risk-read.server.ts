import type { SupabaseClient } from "@supabase/supabase-js";
import { getAppSupabase } from "./supabase-app.server";
import { readB2PublicRisk } from "./b2-live.server";
import {
  GRI_LOOKBACK_HOURS,
  GRI_METHOD_VERSION,
} from "./gri-current-contract";
import {
  assemblePublicGlobalRisk,
  type SnapshotRow,
} from "./global-risk-assemble";
import type { GlobalRisk, RiskRow } from "./global-risk.types";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const LOOKBACK = GRI_LOOKBACK_HOURS * HOUR;

async function loadRecentEvents(
  supabase: SupabaseClient,
  since: string,
  limit = 24,
): Promise<RiskRow[]> {
  const { data, error } = await supabase
    .from("events")
    .select(
      "id,source_title,summary,category,severity,confidence,delta,source_name,source_domain,source_url,created_at,published_at,classification_provider,classification_model,classification_version,classification_prompt_version,classification_input_hash,market_created",
    )
    .in("category", ["geopolitics", "macro", "rare_earth"])
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as RiskRow[];
}

async function readVerifiedB2GlobalRiskOrThrow(reason: string): Promise<GlobalRisk> {
  const b2 = await readB2PublicRisk();
  if (b2) {
    console.warn(`[public-gri] ${reason}; serving verified B2 snapshot`);
    return b2;
  }
  throw new Error(reason);
}

/**
 * Read the canonical public GRI through Supabase when it is available. The
 * exact same pure assembler is used by the direct-Postgres B2 recovery path,
 * so a quota/outage recovery cannot change proof rules or historical windows.
 */
export async function readPublicGlobalRisk(): Promise<GlobalRisk> {
  const supabase = getAppSupabase();
  if (!supabase) return readVerifiedB2GlobalRiskOrThrow("Risk index store unavailable");

  const now = Date.now();
  const snapshotSince = new Date(now - 31 * DAY).toISOString();
  const snapshotResult = await supabase
    .from("gri_snapshots")
    .select(
      "id,as_of,methodology_version,methodology_hash,input_hash,evidence_hash,calculation_hash,disposition_hash,candidate_event_count,proof_version,proof_hash,verification_status,reconciliation_residual,change_residual,raw_score,display_score,coverage,weighted_confidence,active_categories,event_count,source_count,independent_story_count,story_correlation_version,story_correlation_prompt_version,category_breakdown,previous_as_of,previous_raw_score,previous_display_score,change_points,change_hash,change_attribution,explanation,status",
    )
    .eq("status", "published")
    .eq("methodology_version", GRI_METHOD_VERSION)
    .gte("as_of", snapshotSince)
    .order("as_of", { ascending: false })
    .limit(1000);

  if (snapshotResult.error) {
    console.error("[public-gri] canonical snapshot read failed", snapshotResult.error.message);
    return readVerifiedB2GlobalRiskOrThrow("Unable to load the canonical Global Risk Index");
  }
  if (!snapshotResult.data?.length) {
    return readVerifiedB2GlobalRiskOrThrow(
      "No published verified snapshot exists for the current GRI methodology",
    );
  }

  const recentEvents = await loadRecentEvents(
    supabase,
    new Date(now - LOOKBACK).toISOString(),
  );

  return assemblePublicGlobalRisk(
    snapshotResult.data as SnapshotRow[],
    recentEvents,
    now,
  );
}
