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
  // Single static GKG batch is the primary source-OBSERVATION route:
  // 1 index + 1 zip GET, not 3 DOC search queries per 30-minute heartbeat.
  // Reduces rate-limit pressure on GDELT DOC for users needing on-demand
  // search. The GKG clock is *index batch*, not original publication.
  let gkg;
  try {
    // Always reuse the SINGLE integrity-verified GKG archive already in
    // memory; never download a second zip or poll DOC for this review.
    // Adds <=2 first-party article checks per category (<=6 in total)
    // solely for private precise publisher-date verification.
    gkg=await gkgProbe({now,reviewFirstParty:true});
    const hasThree=Array.isArray(gkg?.domains)&&gkg.domains.length===3 &&
      new Set(gkg.domains.map(x=>x.category)).size===3 &&
      DOMAINS.every(domain=>gkg.domains.some(x=>
        x.category===domain &&
        Number.isSafeInteger(x.theme_matched_article_count) &&
        x.theme_matched_article_count>=0 && x.theme_matched_article_count<=100000 &&
        Number.isSafeInteger(x.observed_outlet_host_count) &&
        x.observed_outlet_host_count>=0 &&
        x.observed_outlet_host_count<=x.theme_matched_article_count &&
        x.article_origin_publication_verified===false &&
        x.same_event_independently_corroborated===false &&
        x.current_scored_event_verified===false &&
        x.commercial_rights_verified===false && x.chargeable===false));
    if(gkg?.schema!==GDELT_GKG_BULK_SCHEMA ||
       !["CURRENT_GKG_BATCH_SCANNED_PRIVATE_DISCOVERY_ONLY","GKG_BULK_DEGRADED"].includes(gkg.state) ||
       gkg.chargeable!==false || gkg.public_published!==false ||
       gkg.supabase_requests!==0 || gkg.b2_requests!==0 ||
       gkg.d1_writes!==0 || gkg.payments_performed!==0 ||
       (gkg.state==="CURRENT_GKG_BATCH_SCANNED_PRIVATE_DISCOVERY_ONLY" &&
        (gkg.archive_integrity_verified!==true || !hasThree ||
         !Number.isSafeInteger(gkg.batch_age_minutes) ||
         gkg.batch_age_minutes<0 || gkg.batch_age_minutes>120 ||
         !/^[a-f0-9]{64}$/u.test(gkg.archive_sha256??"") ||
         gkg.original_pubdate_verified!==false ||
         gkg.independent_event_verified!==false)))
      gkg={schema:GDELT_GKG_BULK_SCHEMA,state:"GKG_BULK_AUDIT_INVALID",
        original_pubdate_verified:false,public_published:false,chargeable:false};
  }catch {
    gkg={schema:GDELT_GKG_BULK_SCHEMA,state:"GKG_BULK_UNAVAILABLE",
      original_pubdate_verified:false,public_published:false,chargeable:false};
  }
  if(gkg.state==="CURRENT_GKG_BATCH_SCANNED_PRIVATE_DISCOVERY_ONLY"){
    // DOC search has NOT been checked, so cannot mark DOC as healthy or
    // infer licensed/verified original risk news from indexed topic matches.
    return {
      schema:"geomacro.global-open-signal-discovery.v1",
      checked_at:now.toISOString(),source:"gdelt_v2_gkg_static_15m_archive",
      poll_minutes:30,source_heartbeat_max_age_minutes:120,
      source_reachability:"GKG_BULK_ACTIVE_DOC_NOT_POLLED",
      categories:DOMAINS.map(category=>({
        category,source_transport_ok:false,state:"DOC_NOT_POLLED_GKG_PRIMARY",
        source_failure_reason:"DOC_NOT_POLLED",
        original_article_publication_verified:false,
        same_event_independently_corroborated:false,
        commercial_rights_verified:false,publicly_scored:false,chargeable:false,
      })),
      gdelt_static_bulk_discovery:gkg,
      independent_original_publisher_fallback:NOT_NEEDED,
      source_heartbeat_is_event_freshness:false,
      three_category_current_scored_ready:false,
      chargeable:false,supabase_reads:0,supabase_writes:0,
      b2_requests:0,payments_performed:0,
    };
  }
  // Only on GKG outage/invalidity try the conventional DOC API, bounded
  // by its own 429 stop. An unrelated official source remains last resort.
  let primary;
  try {primary=await primaryProbe({now});}
  catch {
    primary={schema:"geomacro.global-open-signal-discovery.v1",
      checked_at:now.toISOString(),source_reachability:"DEGRADED",
      categories:[],source_failure_reason:"PRIMARY_MONITOR_EXCEPTION",
      chargeable:false,supabase_reads:0,supabase_writes:0,b2_requests:0};
  }
  if(primary?.source_reachability==="ALL_POLL_OK")
    return {...primary,gdelt_static_bulk_discovery:gkg,
      independent_original_publisher_fallback:NOT_NEEDED};
  let backup;
  try{backup=summarizeOriginalFallback(await officialProbe({now}));}
  catch{backup={...NOT_NEEDED,state:"ORIGINAL_SOURCE_UNAVAILABLE"};}
  return {...primary,source_reachability:"DEGRADED",
    gdelt_static_bulk_discovery:gkg,
    independent_original_publisher_fallback:backup};
}
