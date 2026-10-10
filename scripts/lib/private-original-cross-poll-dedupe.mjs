/**
 * #1827: across-run, PRIVATE same-original-article fingerprint suppression.
 * Identical SHA-256 first-party URL in later GitHub 30m polls is NOT a new
 * candidate. Distinct original URLs are never merged merely for matching
 * titles/headlines. No original title, URL, full story, source credentials,
 * publisher identity or rights flag is stored in D1.
 *
 * NOT scoring, same-event corroboration, signed GRO or commercial clearance.
 */
const DOMAINS = new Set(["geopolitics","macro","rare_earth"]);
const HEX = /^[a-f0-9]{64}$/u;
const RETAIN_MS = 12 * 60 * 60 * 1000;
const CANDIDATE_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const MAX_PER_DOMAIN = 240;

function time(value) {
  if(typeof value !== "string" || !/^20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(value))
    return NaN;
  return Date.parse(value);
}
export function reconcile30mPrivateArticleFingerprints({
  domain, checkedAt, candidates = [], previousHistory,
} = {}) {
  if(!DOMAINS.has(domain) || !Number.isFinite(time(checkedAt)) ||
     !Array.isArray(candidates) || candidates.length > 80 ||
     (previousHistory !== undefined && !Array.isArray(previousHistory)) ||
     (Array.isArray(previousHistory) && previousHistory.length > MAX_PER_DOMAIN))
    throw Error("SOURCE_PULSE_CANDIDATE_HISTORY_INVALID");
  const now = time(checkedAt);
  const history = new Map();
  for(const entry of previousHistory ?? []) {
    if(!entry || typeof entry!=="object" || Array.isArray(entry) ||
       entry.domain!==domain || !HEX.test(String(entry.article_sha256)) ||
       !Number.isFinite(time(entry.native_published_at)) ||
       time(entry.native_published_at)>now ||
       history.has(entry.article_sha256))
      throw Error("SOURCE_PULSE_PREVIOUS_HISTORY_INVALID");
    const stamped = time(entry.native_published_at);
    if(now-stamped <= RETAIN_MS)
      history.set(entry.article_sha256,{
        domain, article_sha256: entry.article_sha256,
        native_published_at: entry.native_published_at,
      });
  }
  let fresh = 0, repeated = 0;
  const newRefs = [];
  for(const candidate of candidates) {
    if(!candidate || typeof candidate!=="object" || Array.isArray(candidate) ||
       candidate.schema!=="geomacro.private-original-article-candidate.v1" ||
       candidate.domain!==domain ||
       !HEX.test(String(candidate.original_article_sha256)) ||
       !HEX.test(String(candidate.headline_fingerprint_sha256)) ||
       candidate.read_transport_verified!==true ||
       candidate.original_article_content_verified!==false ||
       candidate.same_event_claim_identity_verified!==false ||
       candidate.independently_authored_reporting_verified!==false ||
       candidate.commercial_derived_use_rights_verified!==false ||
       candidate.eligible_for_scoring!==false ||
       candidate.eligible_for_publication!==false ||
       !Number.isFinite(time(candidate.native_published_at)) ||
       time(candidate.native_published_at)>now ||
       now-time(candidate.native_published_at)>CANDIDATE_MAX_AGE_MS)
      throw Error("SOURCE_PULSE_UNSAFE_OR_UNDATED_CANDIDATE");
    const sha = candidate.original_article_sha256;
    if(history.has(sha)) {
      repeated++;
      continue;
    }
    history.set(sha,{
      domain, article_sha256:sha,
      native_published_at:candidate.native_published_at,
    });
    fresh++;
    newRefs.push(sha);
  }
  if(history.size > MAX_PER_DOMAIN) throw Error("SOURCE_PULSE_HISTORY_CAPACITY_EXCEEDED");
  const retained = [...history.values()].sort((a,b) =>
    b.native_published_at.localeCompare(a.native_published_at) ||
    a.article_sha256.localeCompare(b.article_sha256));
  return {
    schema:"geomacro.private-original-cross-poll-dedup.v1",
    new_article_fingerprint_count:fresh,
    repeated_article_fingerprint_count:repeated,
    tracked_article_fingerprint_count:retained.length,
    // These hashed refs never leave the private D1 checkpoint.
    recent_private_article_fingerprints:retained,
    newly_seen_private_article_refs:newRefs,
    same_headline_cross_publisher_event_verified:false,
    source_rights_verified:false,
    scored_intelligence_published:false,
    payment_allowed:false,
  };
}
