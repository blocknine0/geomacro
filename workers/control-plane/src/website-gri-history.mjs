/**
 * Previously B2-readback-verified GRI immutable snapshot -> website-only
 * delayed derived projection. D1 stores the original verified public
 * snapshot; public HTTP never sends the private source-bearing payload.
 *
 * This does NOT reverify B2 at read time. The D1 stored SHA256 and exact
 * originally verified content are checked by the caller before projection.
 */
export const WEBSITE_GRI_HISTORY_SCHEMA="geomacro.website-lagged-global-risk.v1";
export const WEBSITE_GRI_DELAY_MS=60*60*1000;
export const WEBSITE_GRI_HISTORY_RETENTION_MS=30*24*60*60*1000;
export const WEBSITE_GRI_HISTORY_LIMIT=12;
// Keep a bounded rolling ring PLUS the newest website-release-eligible anchor.
// A burst of under-embargo updates or a long quiet period cannot delete it.
export const WEBSITE_GRI_HISTORY_PRUNE_SQL=`
 DELETE FROM website_verified_gri_snapshot_history
 WHERE (source_as_of < ? OR rowid NOT IN
  (SELECT rowid FROM website_verified_gri_snapshot_history
   ORDER BY source_as_of DESC LIMIT ?))
 AND rowid NOT IN
  (SELECT rowid FROM website_verified_gri_snapshot_history
   WHERE source_as_of <= ? ORDER BY source_as_of DESC LIMIT 1)
`;
export const VERIFIED_GRI_B2_PROOF_SCHEMA="geomacro.public-global-risk-live-proof.v1";
const HASH=/^[a-f0-9]{64}$/u;
const PRIVATE_FIELDS=new Set([
 "source_name","source_domain","source_url","source_urls","source_id",
 "source_key","sourceName","sourceDomain","sourceUrl","sourceId",
 "publisher","publisher_name","provider","provider_name",
 "raw_content","raw_payload","raw_article","raw_source","provenance",
 "original_source","retrieval_metadata",
 // Alternative spellings and nested transport metadata must never appear
 // in the website's public historical projection; aggregate risk scores,
 // verification hashes and source-count metrics remain intact.
 "sourceURL","sourceUrl","sourceLink","source_link",
 "publisherURL","publisherUrl","publisher_url","publisher_link",
 "providerURL","providerUrl","provider_url",
 "articleURL","articleUrl","article_url","article_title","raw_title",
 "referenceURL","referenceUrl","reference_url",
 "citationURL","citationUrl","citation_url",
 "evidenceURL","evidenceUrl","evidence_url",
 "raw_headline","raw_record","raw_sources","source_payload",
 "b2_object_key","s3_object_key","private_bucket","api_key",
 "bearer_token","secret","access_token",
]);
function redactPrivateFields(value){
 if(Array.isArray(value))return value.map(redactPrivateFields);
 if(!value||typeof value!=="object")return value;
 const safe={};
 for(const [key,nested] of Object.entries(value)){
  if(PRIVATE_FIELDS.has(key))continue;
  safe[key]=redactPrivateFields(nested);
 }
 return safe;
}

function time(value) {
  const n=Date.parse(String(value??""));
  return Number.isFinite(n)?n:NaN;
}

export function privateVerifiedGriHistoryProjection(row,{now=Date.now()}={}){
 if(!Number.isFinite(now)||!row||typeof row!=="object")return null;
 const cutoff=now-WEBSITE_GRI_DELAY_MS;
 const asOf=time(row.source_as_of),verifiedAt=time(row.original_verified_at);
 if(!Number.isFinite(asOf)||asOf>cutoff||
    !Number.isFinite(verifiedAt)||verifiedAt>now+5*60_000||
    row.proof_schema!==VERIFIED_GRI_B2_PROOF_SCHEMA||
    !HASH.test(String(row.payload_sha256??""))||
    !HASH.test(String(row.b2_sha256??"")))return null;
 let value;
 try{value=JSON.parse(String(row.payload_json??""))}catch{return null;}
 const data=value?.data;
 if(value?.schema!=="geomacro.public-global-risk-live.v1"||
    value?.source_project!=="ldpwajisioljyjtojvfx"||
    data?.snapshotAsOf!==row.source_as_of||
    data?.methodologyVersion!=="gri-v1.2.0"||
    data?.verificationStatus!=="verified"||
    data?.auditPersisted!==true||
    !HASH.test(String(data?.proofHash??""))||
    !HASH.test(String(data?.inputHash??""))||
    !HASH.test(String(data?.calculationHash??""))||
    !data?.domainIndices||
    typeof data.domainIndices!=="object")return null;
 for(const v of Object.values(data.domainIndices)){
  if(v!==null&&(typeof v!=="object"||
    !Number.isFinite(time(v.readingAsOf))||time(v.readingAsOf)>cutoff))return null;
 }
 if(!Array.isArray(data.recentEvents)||data.recentEvents.some(e=>{
  const pub=time(e?.published_at),rec=time(e?.created_at);
  return Number.isFinite(pub)&&pub>cutoff||
    Number.isFinite(rec)&&rec>cutoff;
 }))return null;
 if(!Array.isArray(data.drivers))return null;
 const scrubbed=redactPrivateFields({
  ...data,
  // Never forward a publisher event row or title/summary/URL to the site.
  recentEvents:[],
  drivers:data.drivers.map(d=>({...d,topEvent:null})),
  topDriver:data.topDriver?{...data.topDriver,topEvent:null}:null,
 });
 return {
  ok:true,schema:WEBSITE_GRI_HISTORY_SCHEMA,
  website_only:true,minimum_delay_minutes:60,
  snapshot_as_of:data.snapshotAsOf,
  verification_status:"verified",
  prior_b2_readback_verified_at_write:true,
  independently_rechecked_b2_now:false,
  source_identity_disclosed:false,raw_upstream_disclosed:false,
  chargeable:false,paid_delivery_authorized:false,
  data:scrubbed,
 };
}
