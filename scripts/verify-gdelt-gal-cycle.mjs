#!/usr/bin/env node

import fs from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const PROJECT_REF = "ldpwajisioljyjtojvfx";
const SOURCE_KEY = "gdelt_gal";
const STREAM_KEY = "global-relevant";
const MAX_LAG_SECONDS = 30 * 60;
const CYCLE_STARTED_AT = String(process.env.GDELT_GAL_CYCLE_STARTED_AT ?? "").trim();
const EXPECTED_FRAGMENT_ID = String(process.env.GDELT_GAL_EXPECTED_FRAGMENT_ID ?? "").trim();
const EXPECTED_SOURCE_STAMP = String(process.env.GDELT_GAL_EXPECTED_SOURCE_STAMP ?? "").trim();
const HOT_TOPIC_OUTPUT = String(process.env.GDELT_GAL_HOT_TOPIC_OUTPUT ?? "").trim();
const OUTPUT_DIR = String(process.env.GDELT_GAL_CYCLE_OUTPUT_DIR ?? "gdelt-gal-cycle").trim();

function projectRef(url) {
  try { return new URL(url).hostname.split(".")[0] ?? ""; } catch { return ""; }
}

function requireDate(value, label) {
  const ms = Date.parse(String(value ?? ""));
  if (!Number.isFinite(ms)) throw new Error(`Missing or invalid ${label}`);
  return ms;
}

function requireSourceStampMs(stamp, label) {
  const value = String(stamp ?? "").trim();
  if (!/^\d{14}$/.test(value)) throw new Error(`Missing or invalid ${label}`);
  return Date.UTC(
    Number(value.slice(0, 4)),
    Number(value.slice(4, 6)) - 1,
    Number(value.slice(6, 8)),
    Number(value.slice(8, 10)),
    Number(value.slice(10, 12)),
    Number(value.slice(12, 14)),
  );
}

async function main() {
  if (!CYCLE_STARTED_AT || !EXPECTED_FRAGMENT_ID || !EXPECTED_SOURCE_STAMP || !HOT_TOPIC_OUTPUT) {
    throw new Error("GDELT_GAL_CYCLE_VERIFICATION_CONTEXT_REQUIRED");
  }

  const url = String(process.env.APP_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "").trim();
  const key = String(process.env.APP_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!url || !key) throw new Error("AUTHORITATIVE_SUPABASE_CREDENTIALS_REQUIRED");
  if (projectRef(url) !== PROJECT_REF) throw new Error("NON_AUTHORITATIVE_SUPABASE_PROJECT");

  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const now = new Date();
  const cycleStartMs = requireDate(CYCLE_STARTED_AT, "GDELT_GAL_CYCLE_STARTED_AT");

  const { data: cursor, error: cursorError } = await db
    .from("live_ingestion_cursors")
    .select("cursor,status,last_attempt_at,last_success_at,last_item_at,consecutive_failures,updated_at")
    .eq("source_key", SOURCE_KEY)
    .eq("stream_key", STREAM_KEY)
    .maybeSingle();
  if (cursorError) throw cursorError;

  const lastSuccessMs = requireDate(cursor?.last_success_at, "GDELT GAL cursor.last_success_at");
  const pipelineLagSeconds = Math.max(0, Math.floor((now.getTime() - lastSuccessMs) / 1000));
  const cursorStamp = String(cursor?.cursor?.last_source_stamp ?? "");
  const sourceStampMs = requireSourceStampMs(cursorStamp, "GDELT GAL cursor.last_source_stamp");
  const sourceLagSeconds = Math.max(0, Math.floor((now.getTime() - sourceStampMs) / 1000));
  if (!["healthy", "degraded"].includes(String(cursor?.status ?? ""))) throw new Error(`GDELT GAL cursor status is ${cursor?.status ?? "missing"}`);
  if (Number(cursor?.consecutive_failures ?? 0) !== 0) throw new Error(`GDELT GAL cursor has ${cursor?.consecutive_failures ?? 0} consecutive failures`);
  if (lastSuccessMs < cycleStartMs) throw new Error("GDELT GAL cursor was not refreshed by this cycle");
  if (cursorStamp !== EXPECTED_SOURCE_STAMP) {
    throw new Error(`GDELT GAL cursor stamp mismatch: expected ${EXPECTED_SOURCE_STAMP}, got ${cursorStamp}`);
  }
  if (pipelineLagSeconds > MAX_LAG_SECONDS) {
    throw new Error(`GDELT GAL pipeline completion lag exceeds 1800s: ${pipelineLagSeconds}`);
  }
  if (sourceLagSeconds > MAX_LAG_SECONDS) {
    throw new Error(`GDELT GAL source-stamp lag exceeds 1800s: ${sourceLagSeconds}`);
  }

  const { data: fragment, error: fragmentError } = await db
    .from("live_fragment_manifest")
    .select("id,source_key,stream_key,sealed_at,period_start,period_end,item_count,compressed_sha256")
    .eq("id", EXPECTED_FRAGMENT_ID)
    .eq("source_key", SOURCE_KEY)
    .eq("stream_key", STREAM_KEY)
    .maybeSingle();
  if (fragmentError) throw fragmentError;
  if (!fragment) throw new Error("Expected fresh GDELT GAL fragment was not found");
  if (requireDate(fragment.sealed_at, "fragment.sealed_at") < cycleStartMs) {
    throw new Error("GDELT GAL fragment predates the current cycle");
  }
  if (Number(fragment.item_count ?? 0) <= 0) {
    throw new Error("Fresh GDELT GAL fragment contains no accepted items");
  }
  const periodEndMs = requireDate(fragment.period_end, "fragment.period_end");
  const periodEndLagSeconds = Math.max(0, Math.floor((now.getTime() - periodEndMs) / 1000));
  if (periodEndLagSeconds > MAX_LAG_SECONDS) {
    throw new Error(`GDELT GAL fragment period_end lag exceeds 1800s: ${periodEndLagSeconds}`);
  }

  const { count: evidenceCount, error: evidenceError } = await db
    .from("live_structured_event_evidence")
    .select("event_id", { count: "exact", head: true })
    .eq("fragment_id", EXPECTED_FRAGMENT_ID);
  if (evidenceError) throw evidenceError;
  if (Number(evidenceCount ?? 0) <= 0) {
    throw new Error("Fresh GDELT GAL fragment did not reach the structured-event evidence layer");
  }

  const { data: evidence, error: evidenceListError } = await db
    .from("live_structured_event_evidence")
    .select("event_id")
    .eq("fragment_id", EXPECTED_FRAGMENT_ID)
    .limit(5000);
  if (evidenceListError) throw evidenceListError;

  const eventIds = [...new Set((evidence ?? []).map((row) => String(row.event_id)).filter(Boolean))];
  if (eventIds.length === 0) throw new Error("No structured event IDs linked to fresh GDELT GAL fragment");

  let rightsMismatches = 0;
  let eventsChecked = 0;

  for (let offset = 0; offset < eventIds.length; offset += 100) {
    const chunk = eventIds.slice(offset, offset + 100);
    const [{ data: rights, error: rightsError }, { data: events, error: eventsError }] = await Promise.all([
      db.from("live_structured_event_commercial_rights_evaluation")
        .select("event_id,evaluated_status,reason_codes")
        .in("event_id", chunk),
      db.from("live_structured_events")
        .select("id,last_observed_at,commercial_eligibility_status,commercial_eligibility_reason_codes")
        .in("id", chunk),
    ]);
    if (rightsError) throw rightsError;
    if (eventsError) throw eventsError;

    const rightsMap = new Map((rights ?? []).map((row) => [String(row.event_id), row]));
    const eventsMap = new Map((events ?? []).map((row) => [String(row.id), row]));
    for (const eventId of chunk) {
      const event = eventsMap.get(eventId);
      if (!event) throw new Error(`Structured event ${eventId} referenced by fresh evidence is missing`);
      const right = rightsMap.get(eventId);
      if (!right) throw new Error(`Missing commercial-rights evaluation for structured event ${eventId}`);
      eventsChecked += 1;
      if (
        String(event.commercial_eligibility_status ?? "") !== String(right.evaluated_status ?? "")
        || JSON.stringify(event.commercial_eligibility_reason_codes ?? [])
          !== JSON.stringify(right.reason_codes ?? [])
      ) {
        rightsMismatches += 1;
      }
    }
  }

  if (eventsChecked !== eventIds.length) throw new Error(`Fresh GDELT GAL evidence/event coverage mismatch: evidence=${eventIds.length}, structured=${eventsChecked}`);
  if (rightsMismatches > 0) {
    throw new Error(`Structured-event commercial eligibility reconciliation mismatch count: ${rightsMismatches}`);
  }

  const hotTopic = JSON.parse(await fs.readFile(HOT_TOPIC_OUTPUT, "utf8"));
  const hotGeneratedMs = requireDate(hotTopic?.generated_at, "hot-topic audit.generated_at");
  if (hotGeneratedMs < cycleStartMs) throw new Error("Hot-topic audit predates the current GDELT GAL cycle");
  const hotPipeline = hotTopic?.pipeline ?? {};
  const hotLag = Number(hotPipeline?.lag_seconds);
  if (hotPipeline?.healthy !== true) throw new Error("Hot-topic audit did not report pipeline.healthy=true");
  if (!Number.isFinite(hotLag) || hotLag > MAX_LAG_SECONDS) {
    throw new Error(`Hot-topic audit freshness lag exceeds 1800s: ${hotLag}`);
  }
  if (Number(hotTopic?.summary?.recent_event_count ?? 0) <= 0) {
    throw new Error("Hot-topic audit found no recent structured event signal after fresh GDELT cycle");
  }
  if (hotTopic?.writes_performed !== false) {
    throw new Error("Hot-topic audit must be read-only for the fresh-cycle proof");
  }
  const claimBoundary = hotTopic?.claim_boundary ?? {};
  if (claimBoundary.raw_source_material_redistributed !== false) {
    throw new Error("Hot-topic claim boundary permits raw source redistribution");
  }
  if (claimBoundary.only_verified_or_derived_only_structured_events_are_deliverable !== true) {
    throw new Error("Hot-topic claim boundary does not restrict delivery to verified or derived structured events");
  }
  if (claimBoundary.current_signal_with_only_blocked_rights_is_not_chargeable_for_hot_topics !== true) {
    throw new Error("Hot-topic claim boundary allows blocked-rights current signal to be chargeable");
  }

  const verification = {
    schema_version: "geomacro-gdelt-gal-fresh-cycle-verification-1.0",
    generated_at: now.toISOString(),
    source: {
      source_key: SOURCE_KEY,
      stream_key: STREAM_KEY,
      cursor_status: cursor.status,
      cursor_last_success_at: cursor.last_success_at,
      cursor_last_item_at: cursor.last_item_at,
      cursor_last_source_stamp: cursorStamp,
      pipeline_completion_lag_seconds: pipelineLagSeconds,
      source_lag_seconds: sourceLagSeconds,
      max_lag_seconds: MAX_LAG_SECONDS,
    },
    fragment: {
      fragment_id: fragment.id,
      sealed_at: fragment.sealed_at,
      period_start: fragment.period_start,
      period_end: fragment.period_end,
      period_end_lag_seconds: periodEndLagSeconds,
      item_count: fragment.item_count,
      compressed_sha256: fragment.compressed_sha256,
    },
    structure: {
      evidence_count: Number(evidenceCount ?? 0),
      structured_event_count_checked: eventsChecked,
    },
    eligibility: {
      reconciled_events_checked: eventsChecked,
      rights_mismatches: rightsMismatches,
    },
    hot_topic: {
      healthy: hotPipeline.healthy === true,
      lag_seconds: hotLag,
      recent_event_count: Number(hotTopic?.summary?.recent_event_count ?? 0),
      commercially_deliverable_event_count: Number(hotTopic?.summary?.commercially_deliverable_event_count ?? 0),
      generated_at: hotTopic.generated_at,
      writes_performed: hotTopic.writes_performed,
      claim_boundary: {
        raw_source_material_redistributed: claimBoundary.raw_source_material_redistributed,
        only_verified_or_derived_only_structured_events_are_deliverable:
          claimBoundary.only_verified_or_derived_only_structured_events_are_deliverable,
        current_signal_with_only_blocked_rights_is_not_chargeable_for_hot_topics:
          claimBoundary.current_signal_with_only_blocked_rights_is_not_chargeable_for_hot_topics,
      },
    },
    acceptance: {
      cursor_refreshed_by_current_cycle: true,
      fresh_fragment_created: true,
      fragment_reached_structured_event_layer: true,
      structured_event_rights_reconciled: true,
      hot_topic_pipeline_healthy: true,
      hot_topic_claim_boundary_safe: true,
      hot_topic_report_read_only: true,
      source_lag_within_1800_seconds: sourceLagSeconds <= MAX_LAG_SECONDS,
      lag_within_1800_seconds: sourceLagSeconds <= MAX_LAG_SECONDS
        && pipelineLagSeconds <= MAX_LAG_SECONDS
        && periodEndLagSeconds <= MAX_LAG_SECONDS
        && hotLag <= MAX_LAG_SECONDS,
      writes_performed_by_verifier: false,
    },
  };

  await fs.writeFile(
    `${OUTPUT_DIR}/cycle-verification.json`,
    JSON.stringify(verification, null, 2) + "\n",
    "utf8",
  );
  console.log(JSON.stringify(verification, null, 2));
  console.log("PASS: GDELT GAL FRESH-CYCLE VERIFICATION COMPLETE");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
