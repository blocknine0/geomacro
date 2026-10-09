/**
 * #1827. Preserve the ACTUAL first-party title and real classifier/collection
 * clock in a separately controlled PRIVATE archive, rather than trying to
 * reverse an irreversible SHA256 title digest from the earlier scoring stage.
 * No source title or URL belongs in D1, GitHub uploaded artifacts or x402.
 *
 * A native publisher flag is ONLY a provenance hint: not rights clearance,
 * independent corroboration, or public-ready GRI story correlation.
 */
import { sha256, STAGE_DOMAINS, CANONICAL_CLASSIFIER_VERSION,
  validatePrivateStageBundle } from "./restricted-private-scored-stage.mjs";

export const PRIVATE_GRI_COMPANION_SCHEMA =
  "geomacro.private-gri-original-publisher-companion.v1";
const HASH=/^[0-9a-f]{64}$/u;
const MAX_TITLE_LENGTH=1200;
const MAX_FUTURE_MS=5*60_000;
const MAX_AGE_MS=24*60*60_000;

function check(ok,code) { if(!ok) throw new Error(code); }
function iso(value,now) {
  const ms=Date.parse(String(value ?? ""));
  check(Number.isFinite(ms) && ms<=now+MAX_FUTURE_MS &&
    now-ms<=MAX_AGE_MS,"PRIVATE_GRI_COMPANION_TIME_INVALID");
  return new Date(ms).toISOString();
}
function titleText(value) {
  check(typeof value==="string", "PRIVATE_GRI_COMPANION_TITLE_INVALID");
  const valueNormalized=value.replace(/\s+/gu," ").trim();
  check(valueNormalized.length>=16 && valueNormalized.length<=MAX_TITLE_LENGTH &&
    !/[\u0000-\u001f\u007f]/u.test(valueNormalized),
    "PRIVATE_GRI_COMPANION_TITLE_INVALID");
  return valueNormalized;
}
function validURL(input) {
  let u;
  try { u=new URL(String(input ?? "")); }
  catch { throw new Error("PRIVATE_GRI_COMPANION_URL_INVALID"); }
  check(u.protocol==="https:" && !u.username && !u.password &&
    !u.hash && u.href.length<=2048 &&
    /^[a-z0-9.-]+\.[a-z]{2,24}$/u.test(u.hostname),
    "PRIVATE_GRI_COMPANION_URL_INVALID");
  return u;
}

export function capturePrivateGriSourceCompanion({
  article, staged, capturedAt=new Date(),
}={}) {
  const nowMs=capturedAt instanceof Date ? capturedAt.getTime():NaN;
  check(Number.isFinite(nowMs),"PRIVATE_GRI_COMPANION_CLOCK_INVALID");
  const url=validURL(article?.url);
  const domain=String(article?.sourceDomain ?? "").trim().toLowerCase();
  const title=titleText(article?.title);
  const titleHash=sha256(title.toLowerCase());
  const original=iso(article?.publishedAt,nowMs);
  const urlText=url.href;
  const eventId=sha256([staged?.category,urlText,titleHash,original].join("\n"));
  check(STAGE_DOMAINS.includes(staged?.category) &&
    staged?.id===eventId &&
    staged?.private_source?.source_url===urlText &&
    staged?.private_source?.source_domain===domain &&
    staged?.private_source?.source_title_sha256===titleHash &&
    domain===url.hostname.toLowerCase() &&
    staged?.observed_at===original &&
    staged?.public_eligible===false &&
    staged?.rights_verified===false &&
    staged?.independently_corroborated===false &&
    staged?.classifier?.version===CANONICAL_CLASSIFIER_VERSION &&
    HASH.test(String(staged?.classifier?.input_sha256 ?? "")),
    "PRIVATE_GRI_COMPANION_STAGE_BINDING_INVALID");

  const classifiedAt=capturedAt.toISOString();
  return {
    event_id:eventId,
    category:staged.category,
    private_source_title:title,
    private_source_title_sha256:titleHash,
    private_source_url:urlText,
    private_source_domain:domain,
    original_published_at:original,
    first_observed_at:classifiedAt,
    classification_scored_at:classifiedAt,
    classifier_version:staged.classifier.version,
    classifier_prompt_version:staged.classifier.prompt_version,
    classifier_provider:staged.classifier.provider,
    classifier_model:staged.classifier.model,
    classifier_input_sha256:staged.classifier.input_sha256,
    // These upstream discovery hints are not independent publication proofs.
    original_publisher_native_timestamp_hint:
      article?.nativePublishedAtVerified===true &&
      article?.discoveryProvider==="official_native_rss",
    source_authenticity_independently_verified:false,
    rights_verified:false,
    independently_corroborated:false,
    public_eligible:false,
  };
}

function validateCompanionRow(row,staged,nowMs) {
  check(row && typeof row==="object" && !Array.isArray(row) &&
    Object.keys(row).sort().join(",")===
    [
      "event_id","category","private_source_title",
      "private_source_title_sha256","private_source_url",
      "private_source_domain","original_published_at",
      "first_observed_at","classification_scored_at",
      "classifier_version","classifier_prompt_version",
      "classifier_provider","classifier_model","classifier_input_sha256",
      "original_publisher_native_timestamp_hint",
      "source_authenticity_independently_verified","rights_verified",
      "independently_corroborated","public_eligible",
    ].sort().join(","),"PRIVATE_GRI_COMPANION_FIELD_SET_INVALID");
  const url=validURL(row.private_source_url);
  const title=titleText(row.private_source_title);
  const published=iso(row.original_published_at,nowMs);
  const observed=iso(row.first_observed_at,nowMs);
  const scored=iso(row.classification_scored_at,nowMs);
  const hash=sha256(title.toLowerCase());
  check(published<=observed && published<=scored &&
    observed===scored &&
    row.private_source_title===title &&
    row.private_source_title_sha256===hash &&
    row.private_source_domain===url.hostname.toLowerCase() &&
    row.event_id===sha256([row.category,url.href,hash,published].join("\n")) &&
    staged?.id===row.event_id &&
    staged?.category===row.category &&
    staged?.private_source?.source_url===row.private_source_url &&
    staged?.private_source?.source_domain===row.private_source_domain &&
    staged?.private_source?.source_title_sha256===hash &&
    staged?.observed_at===published &&
    staged?.classifier?.version===row.classifier_version &&
    staged?.classifier?.prompt_version===row.classifier_prompt_version &&
    staged?.classifier?.provider===row.classifier_provider &&
    staged?.classifier?.model===row.classifier_model &&
    staged?.classifier?.input_sha256===row.classifier_input_sha256 &&
    typeof row.original_publisher_native_timestamp_hint==="boolean",
    "PRIVATE_GRI_COMPANION_BINDING_INVALID");
  check(row.source_authenticity_independently_verified===false &&
    row.rights_verified===false &&
    row.independently_corroborated===false &&
    row.public_eligible===false,
    "PRIVATE_GRI_COMPANION_PUBLICATION_UNAUTHORIZED");
  return row;
}

/** Fail closed if ANY scored candidate lacks its private original-source link. */
export function makePrivateGriCompanionBundle(stage,records,{now=new Date()}={}) {
  const nowMs=now.getTime();
  check(Number.isFinite(nowMs),"PRIVATE_GRI_COMPANION_CLOCK_INVALID");
  validatePrivateStageBundle(stage,{now});
  check(Array.isArray(records) && records.length===stage.rows.length &&
    records.length>=1 && records.length<=6,
    "PRIVATE_GRI_COMPANION_STAGE_COUNT_MISMATCH");
  const byId=new Map(stage.rows.map(row=>[row.id,row]));
  const used=new Set();
  const normalized=records.map(row=>{
    check(!used.has(row?.event_id),"PRIVATE_GRI_COMPANION_DUPLICATE");
    used.add(row.event_id);
    return validateCompanionRow(row,byId.get(row.event_id),nowMs);
  }).sort((a,b)=>a.category.localeCompare(b.category)||
    a.event_id.localeCompare(b.event_id));
  check(normalized.length===stage.rows.length,
    "PRIVATE_GRI_COMPANION_STAGE_COUNT_MISMATCH");
  return {
    schema:PRIVATE_GRI_COMPANION_SCHEMA,
    private_only:true,
    public_published:false,
    commercial_eligible:false,
    rights_verification_pending:true,
    independent_corroboration_pending:true,
    original_sources_private_only:true,
    stage_bundle_sha256:sha256(JSON.stringify(stage)),
    counts:stage.counts,
    rows:normalized,
  };
}
export function validatePrivateGriCompanionBundle(bundle,stage,{now=new Date()}={}) {
  check(bundle && bundle.schema===PRIVATE_GRI_COMPANION_SCHEMA &&
    bundle.private_only===true &&
    bundle.public_published===false &&
    bundle.commercial_eligible===false &&
    bundle.rights_verification_pending===true &&
    bundle.independent_corroboration_pending===true &&
    bundle.original_sources_private_only===true,
    "PRIVATE_GRI_COMPANION_BUNDLE_UNAUTHORIZED");
  const rebuilt=makePrivateGriCompanionBundle(stage,bundle.rows,{now});
  check(JSON.stringify(rebuilt)===JSON.stringify(bundle),
    "PRIVATE_GRI_COMPANION_BUNDLE_TAMPERED");
  return rebuilt;
}
