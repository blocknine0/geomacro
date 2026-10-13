#!/usr/bin/env node
/**
 * Bounded, private no-card three-category official transport observation.
 * One request per category per run, rotating three providers per domain.
 * Raw payloads are never logged/stored; only coarse health metadata.
 * Existing source adapters/signers and commercial rights are NOT modified.
 */
import { observeNoKeyLineup } from "../lib/free-no-key-source-probe.mjs";
import { sourceLineupSummary } from "../lib/operator-commercial-free-source-lineup.mjs";

const DAY_PART_MS = 12 * 60 * 60 * 1000;
const group = process.env.FREE_SOURCE_GROUP == null
  ? Math.floor(Date.now() / DAY_PART_MS) % 3
  : Number(process.env.FREE_SOURCE_GROUP);

if (!Number.isInteger(group) || group < 0 || group > 2)
  throw new Error("SOURCE_PROBE_GROUP_INVALID");

const report = await observeNoKeyLineup(group);
const counts = sourceLineupSummary();
const safe = {
  schema: "geomacro.free-source-transport-prod-observation.v1",
  at: report.checked_at,
  group: report.group,
  families_catalogued: counts.total_families,
  families_per_category: counts.by_category,
  exact_dataset_rights_reviewed_count: counts.existing_exact_rights_verified.length,
  probe_attempted: report.attempted,
  categories: report.per_category,
  transport_outcomes: {
    readable: report.rows.filter(x => x.state === "TRANSPORT_READABLE").length,
    reachable_format_unverified: report.rows.filter(x => x.state === "ENDPOINT_REACHABLE_FORMAT_UNVERIFIED").length,
    denied_or_rate_limited: report.rows.filter(x => x.state === "DENIED_OR_RATE_LIMIT").length,
    other_failures: report.rows.filter(x =>
      !["TRANSPORT_READABLE","ENDPOINT_REACHABLE_FORMAT_UNVERIFIED","DENIED_OR_RATE_LIMIT"].includes(x.state)).length,
  },
  original_publication_or_same_event_corroboration_proven: false,
  new_dataset_commercial_rights_approved: false,
  all_sources_live: false,
  new_paid_sources_activated: 0,
  signed_gro_generated: false,
  x402_payment_authorized: false,
  payments: report.payments,
  raw_upstream_payload_persisted: false,
  supabase_requests: 0, d1_requests: 0, b2_requests: 0,
};
// Print only category totals: no raw source, URL, content, title or token.
console.log(JSON.stringify(safe));
if (!Object.values(report.per_category).every(x => x.readable >= 1)) {
  console.error("FREE_SOURCE_MESH_PARTIAL_OR_BLOCKED; check feed rights/transport before promotion");
  process.exitCode = 2;
}
