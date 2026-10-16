import {fetchWithoutRedirect} from "./fetch-without-redirect";
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
const LOOKBACK = GRI_LOOKBACK_HOURS * HOUR;

async function loadRecentEvents(
  supabase: SupabaseClient,
  since: string,
  through: string,
  limit = 24,
): Promise<RiskRow[]> {
  const { data, error } = await supabase
    .from("events")
    .select(
      "id,source_title,summary,category,severity,confidence,delta,source_name,source_domain,source_url,created_at,published_at,classification_provider,classification_model,classification_version,classification_prompt_version,classification_input_hash,market_created",
    )
    .in("category", ["geopolitics", "macro", "rare_earth"])
    .gte("created_at", since)
    .lte("created_at", through)
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
 *
 * History is intentionally NOT filtered relative to wall-clock `now`. A stale
 * publisher must not make old verified points disappear merely because time
 * passed. The assembler clips the newest verified rows relative to the latest
 * verified snapshot for its 24H/7D/30D windows.
 */
export async function readPublicGlobalRisk(): Promise<GlobalRisk> {
  const supabase = getAppSupabase();
  if (!supabase) return readVerifiedB2GlobalRiskOrThrow("Risk index store unavailable");

  const now = Date.now();
  const snapshotResult = await supabase
    .from("gri_snapshots")
    .select(
      "id,as_of,methodology_version,methodology_hash,input_hash,evidence_hash,calculation_hash,disposition_hash,candidate_event_count,proof_version,proof_hash,verification_status,reconciliation_residual,change_residual,raw_score,display_score,coverage,weighted_confidence,active_categories,event_count,source_count,independent_story_count,story_correlation_version,story_correlation_prompt_version,category_breakdown,previous_as_of,previous_raw_score,previous_display_score,change_points,change_hash,change_attribution,explanation,status",
    )
    .eq("status", "published")
    .eq("verification_status", "verified")
    .eq("methodology_version", GRI_METHOD_VERSION)
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

  const snapshots = snapshotResult.data as SnapshotRow[];
  const latestAsOf = snapshots[0].as_of;
  const latestAt = Date.parse(latestAsOf);
  if (!Number.isFinite(latestAt)) {
    return readVerifiedB2GlobalRiskOrThrow("Newest Global Risk snapshot timestamp is invalid");
  }

  const recentEvents = await loadRecentEvents(
    supabase,
    new Date(latestAt - LOOKBACK).toISOString(),
    latestAsOf,
  );

  return assemblePublicGlobalRisk(snapshots, recentEvents, now);
}

/**
 * Website-only one-hour delayed genuine VERIFIED GRI read.
 *
 * Unlike the live machine/API reader, this selects the *previous genuine
 * published verified snapshot* at or before the public release cutoff.
 * Signed methodology hashes, original snapshot clock and category-history
 * proofs are never backdated or synthesized.
 * If frozen Supabase is inaccessible, accept only a full independently
 * verified B2 package whose original snapshot is already past the cutoff.
 * No Supabase writes, B2 writes or x402 calls.
 */
export async function readWebsiteLaggedGlobalRisk(
  now=Date.now(),
):Promise<GlobalRisk>{
  const {websitePublicCutoff,websiteVerifiedSnapshotPastEmbargo}=
    await import("./website-publication-delay");
  const {validateGlobalRiskContinuity}=
    await import("./global-risk-continuity");
  const cutoff=websitePublicCutoff(now);
  let risk:GlobalRisk|null=null;
  // Prefer one bounded existing control-plane D1 read. This is historical
  // website-only; the control plane itself enforces the full 60-minute cutoff
  // and verifies the immutable original public B2-readback SHA-256 before
  // returning a privacy-redacted (not raw-source) GRI projection.
  try{
    const response=await fetchWithoutRedirect(
      "https://geomacro-control-plane.daspallab202391.workers.dev/v1/public/website-lagged-global-risk",
      {method:"GET",redirect:"error",headers:{Accept:"application/json"},
       cache:"no-store",signal:AbortSignal.timeout(3500)},
    );
    if(response.ok){
      const receipt=await response.json() as {
        ok?:boolean;schema?:string;website_only?:boolean;
        minimum_delay_minutes?:number;verification_status?:string;
        prior_b2_readback_verified_at_write?:boolean;
        source_identity_disclosed?:boolean;raw_upstream_disclosed?:boolean;
        chargeable?:boolean;paid_delivery_authorized?:boolean;
        data?:GlobalRisk;
      };
      if(receipt.ok===true&&
         receipt.schema==="geomacro.website-lagged-global-risk.v1"&&
         receipt.website_only===true&&receipt.minimum_delay_minutes===60&&
         receipt.verification_status==="verified"&&
         receipt.prior_b2_readback_verified_at_write===true&&
         receipt.source_identity_disclosed===false&&
         receipt.raw_upstream_disclosed===false&&
         receipt.chargeable===false&&
         receipt.paid_delivery_authorized===false&&receipt.data&&
         websiteVerifiedSnapshotPastEmbargo(receipt.data,now)&&
         validateGlobalRiskContinuity(receipt.data,now).ok){
        risk=receipt.data;
      }
    }
  }catch{
    // D1 may be quota-held or the new migration not yet deployed; continue
    // to the existing strictly verified read-only historical fallback.
  }
  // The production website treats Supabase as permanently unavailable.
  // Never attempt a frozen database read, even after D1 quota exhaustion.
  // Only the independent, already proof-verified Cloudflare GRI EDGE is
  // eligible as website backup. Its own serving order is D1 hot -> POP
  // positive cache -> D1-quota-governed B2 reads (or safe 503).
  //
  // Do NOT call readB2PublicRisk() here: that generic server helper can
  // issue its own direct signed S3 GET on edge failure, bypassing the
  // account-wide B2 Class B governor when quotas are already exhausted.
  if(!risk){
    const {readGlobalRiskEdge}=await import("./global-risk-edge.server");
    const verifiedEdge=await readGlobalRiskEdge();
    if(verifiedEdge)risk=verifiedEdge;
  }
  if(!risk||
     !Number.isFinite(Date.parse(risk.snapshotAsOf))||
     Date.parse(risk.snapshotAsOf)>cutoff||
     !websiteVerifiedSnapshotPastEmbargo(risk,now)||
     !validateGlobalRiskContinuity(risk,now).ok){
    throw new Error("WEBSITE_GRI_ONE_HOUR_VERIFIED_SNAPSHOT_UNAVAILABLE");
  }
  // Website-only derived projection. Original article titles, source URLs,
  // publisher IDs and per-source headlines never reach the browser.
  return {...risk,recentEvents:[],
    drivers:risk.drivers.map(driver=>({...driver,topEvent:null})),
    topDriver:risk.topDriver?{...risk.topDriver,topEvent:null}:null,
  };
}
