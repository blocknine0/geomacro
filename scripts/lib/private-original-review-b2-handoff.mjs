/**
 * Existing native-original intake used to discard its rare genuinely verified
 * review leads when a GitHub runner exited. This is a private, quota-governed
 * archival handoff ONLY. It never creates source rights, facts signatures,
 * an unsigned GRI profile, GRI certification or a payable product.
 */
import {createHash} from "node:crypto";
import {gzipSync,gunzipSync} from "node:zlib";
const PREFIX="geomacro-evidence/v1/private/original-pre-review/";
const SHA=/^[a-f0-9]{64}$/u;
const ISO=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/u;
const CATEGORIES=["geopolitics","macro","rare_earth"];
const sha=b=>createHash("sha256").update(b).digest("hex");
const fail=code=>{throw Error("PRIVATE_ORIGINAL_B2_HANDOFF_"+code)};
const privateLead=lead=>{
 if(lead?.schema!=="geomacro.private-original-signing-review-lead.v1"||
    lead.disposition!=="GENUINE_HTML_BYTES_DATE_VERIFIED_FACTS_AND_RIGHTS_PENDING"||
    !/^[A-Z]{3}$/u.test(lead.country_iso3??"")||
    !CATEGORIES.includes(lead.category)||
    typeof lead.issuer_organization_id!=="string"||
    lead.issuer_organization_id.length<2||
    !SHA.test(lead.original_html_sha256??"")||
    !SHA.test(lead.original_article_identity_sha256??"")||
    !ISO.test(lead.native_original_publication_at??"")||
    !lead.original_article_url?.startsWith("https://")||
    typeof lead.original_article_title!=="string"||
    lead.original_article_title.length<8||
    lead.semantic_event_claim_verified!==false||
    lead.original_article_commercial_rights_verified!==false||
    lead.country_topic_factual_scope_review_pending!==true||
    lead.source_registry_rights_qualified!==false||
    lead.independent_original_count!==0||
    lead.reviewed_event_identity!==null||
    lead.rights_receipt_sha256!==null||
    lead.facts_signature!==null||
    lead.rights_signature!==null||
    lead.commercial_eligible!==false)
   fail("VERIFIED_UNREVIEWED_LEAD_CONTRACT_REQUIRED");
 const time=Date.parse(lead.native_original_publication_at);
 if(!Number.isFinite(time))fail("ORIGINAL_CLOCK_INVALID");
 return true;
};
export function buildPrivateOriginalReviewArchive(leads,{now=new Date(),countryIso3}={}){
 if(!Array.isArray(leads)||leads.length>2||
    !(now instanceof Date)||!Number.isFinite(now.getTime())||
    !/^[A-Z]{3}$/u.test(countryIso3??""))
   fail("SCOPE_INVALID");
 if(leads.length===0)return null;
 const ids=new Set();
 for(const lead of leads){
  privateLead(lead);
  if(lead.country_iso3!==countryIso3 ||
     Date.parse(lead.native_original_publication_at)>now.getTime()+5*60_000||
     now.getTime()-Date.parse(lead.native_original_publication_at)>22*3600_000||
     ids.has(lead.original_article_identity_sha256))
    fail("PRIVATE_LEAD_COUNTRY_CLOCK_OR_UNIQUENESS_INVALID");
  ids.add(lead.original_article_identity_sha256);
 }
 const document={
  schema:"geomacro.private-original-review-lead-archive.v1",
  created_at:now.toISOString(),country_iso3:countryIso3,
  lead_count:leads.length,rights_verified:false,
  facts_and_rights_signed:false,reviewer_signed:false,
  GRI_scored:false,country_certificates_issued:false,
  commercial_eligible:false,x402_payment_authorized:false,
  custodian_action:"REVIEW_ORIGINAL_FACTS_RIGHTS_AND_INDEPENDENT_GRI",
  leads:[...leads].sort((a,b)=>a.original_article_identity_sha256.localeCompare(
    b.original_article_identity_sha256)),
 };
 const raw=Buffer.from(JSON.stringify(document));
 if(raw.length>60_000)fail("PRIVATE_PAYLOAD_SIZE_INVALID");
 const compressed=gzipSync(raw,{level:9,mtime:0});
 if(compressed.length>40_000||compressed.length<50)fail("PRIVATE_GZIP_SIZE_INVALID");
 const packedHash=sha(compressed);
 const key=PREFIX+now.toISOString().slice(0,10).replaceAll("-","/")+
  "/"+packedHash+".json.gz";
 return Object.freeze({key,compressed,
  compressedSha256:packedHash,rawSha256:sha(raw),
  leadCount:leads.length,categories:Object.fromEntries(CATEGORIES.map(c=>
    [c,leads.filter(x=>x.category===c).length]))});
}
export function verifyPrivateOriginalReviewArchive(bytes,plan){
 if(!plan||!Buffer.isBuffer(bytes)||bytes.length>40_000||
    !bytes.equals(plan.compressed)||
    sha(bytes)!==plan.compressedSha256)
   fail("IMMUTABLE_B2_BYTES_READBACK_MISMATCH");
 let raw,doc;
 try{
  raw=gunzipSync(bytes,{maxOutputLength:60_000});
  doc=JSON.parse(raw.toString("utf8"));
 }catch{fail("RESTORED_B2_PRIVATE_ARCHIVE_INVALID");}
 if(sha(raw)!==plan.rawSha256||
    doc.schema!=="geomacro.private-original-review-lead-archive.v1"||
    doc.rights_verified!==false||doc.facts_and_rights_signed!==false||
    doc.reviewer_signed!==false||doc.GRI_scored!==false||
    doc.country_certificates_issued!==false||
    doc.commercial_eligible!==false||
    doc.x402_payment_authorized!==false||
    !Array.isArray(doc.leads)||doc.leads.length!==plan.leadCount||
    doc.leads.some(x=>privateLead(x)!==true))
   fail("B2_REVIEW_ONLY_RESTORE_SCOPE_INVALID");
 return true;
}
export async function archivePrivateOriginalReviewLeads({
 leads,now=new Date(),countryIso3,b2Factory,quotaGovernor
}={}){
 const plan=buildPrivateOriginalReviewArchive(leads,{now,countryIso3});
 if(!plan)return Object.freeze({
  schema:"geomacro.private-original-review-b2-handoff.v1",
  status:"NO_GENUINE_LEADS_TO_ARCHIVE",
  private_original_leads_archived:0,originals_readback_verified:false,
  private_review_hand_off_available:false,
  source_rights_or_facts_signed:false,signed_gri_created:false,
  b2_requests:0,d1_writes:0,payments:0
 });
 if(typeof b2Factory!=="function"||!quotaGovernor?.status)
  fail("PROTECTED_ARCHIVE_AND_D1_QUOTA_GOVERNOR_REQUIRED");
 const quota=await quotaGovernor.status();
 // Preserve at least ten account-wide operations plus 5 GET/PUT
 // operations for signed hot recovery. Admission is advisory; the existing
 // client still reserves every B2 request atomically in shared D1.
 const u=quota?.used,l=quota?.limits;
 if(quota?.schema!=="geomacro.b2-account-quota-status.v1"||
    quota.ok!==true||quota.day_utc!==now.toISOString().slice(0,10)||
    quota.account_wide_reporting_requires_all_clients_governed!==true||
    !u||!l||!Number.isSafeInteger(u.total)||u.total<0||
    !Number.isSafeInteger(u.GET)||u.GET<0||
    !Number.isSafeInteger(u.PUT)||u.PUT<0||
    !Number.isSafeInteger(l.total)||!Number.isSafeInteger(l.GET)||
    !Number.isSafeInteger(l.PUT))fail("D1_B2_QUOTA_STATUS_UNVERIFIED");
 if(u.total>l.total-10||u.GET>l.GET-5||u.PUT>l.PUT-5)
  return Object.freeze({
   schema:"geomacro.private-original-review-b2-handoff.v1",
   status:"SHARED_B2_QUOTA_HELD_NOT_ARCHIVED",
   private_original_leads_archived:0,originals_readback_verified:false,
   private_review_hand_off_available:false,
   source_rights_or_facts_signed:false,signed_gri_created:false,
   b2_requests:0,d1_writes:0,payments:0
  });
 const b2=b2Factory();
 if(!b2?.putWithMetadataVerification)
  fail("VERIFIED_PRIVATE_B2_CLIENT_REQUIRED");
 const result=await b2.putWithMetadataVerification(
  plan.key,plan.compressed,{
   verifyRestored:bytes=>verifyPrivateOriginalReviewArchive(Buffer.from(bytes),plan)
  });
 if(result?.full_body_readback_verified!==true||
    result.sha256!==plan.compressedSha256||
    result.bytes!==plan.compressed.length)
  fail("VERIFIED_PRIVATE_B2_READBACK_REQUIRED");
 // Source identities, confidential object key, raw bytes and SHA hashes are
 // NEVER included in Actions artifacts/logs; private B2 authorized custodian
 // can locate date-partitioned files through their existing scoped credentials.
 return Object.freeze({
  schema:"geomacro.private-original-review-b2-handoff.v1",
  status:"GENUINE_PRE_REVIEW_LEADS_PRIVATELY_ARCHIVED",
  private_original_leads_archived:plan.leadCount,
  original_lead_category_counts:plan.categories,
  original_proof_byte_sha_readback_verified:true,
  originals_readback_verified:true,
  private_review_hand_off_available:true,
  source_rights_or_facts_signed:false,
  independent_gri_review_verified:false,
  signed_gri_created:false,commercial_eligible:false,
  private_original_source_urls_disclosed:false,
  private_b2_archive_key_disclosed:false,
  b2_requests_not_reported_as_payments:true,
  d1_writes:0,payments:0
 });
}
