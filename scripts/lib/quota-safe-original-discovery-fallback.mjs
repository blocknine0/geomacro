// Independent, bounded original-publisher discovery only when GDELT is degraded.
// Does NOT certify rights, correlate same events, score, publish or accept payment.
// A GDELT failure remains visible even if alternate publisher transport works.
import { probeOpenDiscoveryMesh } from "./market-signal-discovery.mjs";
import {probeGdeltGkgBulk, GDELT_GKG_BULK_SCHEMA} from "./gdelt-gkg-bulk-discovery.mjs";
import { probeOfficialThreeDomains } from "../ops/probe-official-native-rss-three-domains.mjs";

const DOMAINS = Object.freeze(["geopolitics", "macro", "rare_earth"]);
const NOT_NEEDED = Object.freeze({
  state: "NOT_NEEDED", domains_reached: 0, private_candidate_counts: null,
  checked_original_publisher_feeds: false, public_scored: false, chargeable: false,
});

// Convert a private-only original-publisher audit to an allowlisted counts-only
// receipt. Never spread the original audit: article URLs/headlines remain private.
export function summarizeOriginalFallback(audit) {
  const rows = audit?.categories;
  if (audit?.schema !== "geomacro.official-native-source-audit.v1" ||
      !Array.isArray(rows) || rows.length !== 3 ||
      audit.supabase_reads !== 0 || audit.supabase_writes !== 0 ||
      audit.b2_requests !== 0 || audit.public_published !== false ||
      audit.proves_public_scored_intelligence !== false) {
    return { ...NOT_NEEDED, state: "BACKUP_AUDIT_INVALID" };
  }
  const byCategory = new Map();
  for (const row of rows) {
    if (!DOMAINS.includes(row?.category) || byCategory.has(row.category) ||
        typeof row.fetch_ok !== "boolean" ||
        typeof row.publisher_transport_ok !== "boolean" ||
        !Number.isSafeInteger(row.recent_original_count) ||
        row.recent_original_count < 0 || row.recent_original_count > 100 ||
        row.public_scored_verified !== false ||
        row.commerce_eligible !== false) {
      return { ...NOT_NEEDED, state: "BACKUP_AUDIT_INVALID" };
    }
    byCategory.set(row.category, row);
  }
  if (byCategory.size !== 3) return { ...NOT_NEEDED, state: "BACKUP_AUDIT_INVALID" };
  const domainsReached = DOMAINS.filter(d => byCategory.get(d).fetch_ok).length;
  const allAttemptedPublisherTransportsOk = DOMAINS.every(
    d => byCategory.get(d).publisher_transport_ok === true);
  return {
    state: domainsReached === 3 && allAttemptedPublisherTransportsOk
      ? "ORIGINAL_SOURCE_POLL_OK" : "ORIGINAL_SOURCE_DEGRADED",
    domains_reached: domainsReached,
    all_attempted_publisher_transports_ok: allAttemptedPublisherTransportsOk,
    // One publisher is not independent event corroboration.
    private_candidate_counts: Object.fromEntries(DOMAINS.map(d =>
      [d, byCategory.get(d).fetch_ok ? byCategory.get(d).recent_original_count : 0])),
    checked_original_publisher_feeds: true,
    same_event_independently_corroborated: false,
    commercial_rights_verified: false,
    public_scored: false,
    chargeable: false,
  };
}

export async function probeQuotaSafeDiscovery({
  now = new Date(),
  primaryProbe = probeOpenDiscoveryMesh,
  officialProbe = probeOfficialThreeDomains,
  gkgProbe = probeGdeltGkgBulk,
} = {}) {
  let primary;
  try {
    primary = await primaryProbe({ now });
  } catch {
    // The official backup still gets a chance if the discovery code throws.
    primary = { schema: "geomacro.global-open-signal-discovery.v1",
      checked_at: now.toISOString(), source_reachability: "DEGRADED",
      categories: [], source_failure_reason: "PRIMARY_MONITOR_EXCEPTION",
      chargeable: false, supabase_reads: 0, supabase_writes: 0, b2_requests: 0 };
  }
  if (primary?.source_reachability === "ALL_POLL_OK") {
    return { ...primary, independent_original_publisher_fallback: NOT_NEEDED };
  }
  // Independent GDELT STATIC bulk update is NOT the rate-limited GDELT DOC
  // search service. Even success certifies only recently indexed GKG themes,
  // not original publisher publication time, event identity or source rights.
  // The DOC 429 stays degraded; no status laundering.
  let gkg;
  try{
    gkg=await gkgProbe({now});
    if(gkg?.schema!==GDELT_GKG_BULK_SCHEMA ||
       !["CURRENT_GKG_BATCH_SCANNED_PRIVATE_DISCOVERY_ONLY","GKG_BULK_DEGRADED"].includes(gkg.state) ||
       gkg.chargeable!==false || gkg.public_published!==false ||
       gkg.supabase_requests!==0 || gkg.b2_requests!==0 || gkg.d1_writes!==0 ||
       gkg.payments_performed!==0 ||
       (gkg.state==="CURRENT_GKG_BATCH_SCANNED_PRIVATE_DISCOVERY_ONLY" &&
         (gkg.archive_integrity_verified!==true ||
          !Array.isArray(gkg.domains)||gkg.domains.length!==3 ||
          gkg.domains.some(x=>!DOMAINS.includes(x.category) ||
            x.article_origin_publication_verified!==false ||
            x.commercial_rights_verified!==false ||
            x.current_scored_event_verified!==false))))
       gkg={schema:GDELT_GKG_BULK_SCHEMA,state:"GKG_BULK_AUDIT_INVALID",
         original_pubdate_verified:false,public_published:false,chargeable:false};
  }catch{
    gkg={schema:GDELT_GKG_BULK_SCHEMA,state:"GKG_BULK_UNAVAILABLE",
      original_pubdate_verified:false,public_published:false,chargeable:false};
  }
  let backup;
  try {
    // Three fixed categories, first-party URLs, bounded transport, zero model,
    // B2, Supabase, D1, source certification or customer delivery operations.
    backup = summarizeOriginalFallback(await officialProbe({ now }));
  } catch {
    backup = { ...NOT_NEEDED, state: "ORIGINAL_SOURCE_UNAVAILABLE" };
  }
  return { ...primary, source_reachability: "DEGRADED",
    gdelt_static_bulk_discovery:gkg,
    independent_original_publisher_fallback: backup };
}
