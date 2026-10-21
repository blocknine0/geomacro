import {createHash} from "node:crypto";
import {COMMERCIAL_SOURCE_RIGHTS_EVIDENCE} from "../commercial-source-rights-evidence.mjs";

/**
 * Rights intake planner, NOT a rights issuer.
 * A source catalogue license is only an indication that a particular
 * dataset may be reused under the exact stated terms. It is never an
 * article-specific permission, signature, or right to conceal attribution.
 *
 * No request to a live source, key, reviewer or publisher is issued here.
 * The retained private queue must be processed by separate protected
 * machine Facts and Rights custodians using genuine original bytes and
 * independently checked written licenses/exception records.
 */
export const RIGHTS_INTAKE_SCHEMA="geomacro.private-commercial-rights-intake.v1";
const SHA=/^[0-9a-f]{64}$/u;
const COUNTRY=/^[A-Z]{3}$/u;
const CATEGORIES=new Set(["geopolitics","macro","rare_earth"]);
const PUBLIC_DOMAIN_SOURCE_IDS=new Set(["usgs_mcs","usgs_earthquake_hazards"]);
const MAX_ITEMS=2000;
const MAX_SOURCES=3000;
const fail=()=>{throw Error("RIGHTS_INTAKE_NOT_VERIFIED")};
const hash=s=>createHash("sha256").update(s,"utf8").digest("hex");
const clean=s=>typeof s==="string"&&s.length>0&&s.length<=350;
const epoch=s=>typeof s==="string"&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/u.test(s)
 ? Date.parse(s):NaN;
const urlValid=s=>{
 try{
  const u=new URL(s);
  return u.protocol==="https:"&&!u.username&&!u.password&&
    !u.hash&&u.hostname.length>3&&u.toString()===s;
 }catch{return false}
};
const privilegeFree=(s)=>!(typeof s==="string"&&/(?:^|[\s/])(api[_-]?key|bearer|token|password|secret)(?:$|[=\s/])/iu.test(s));
const stamp=d=>d instanceof Date&&Number.isFinite(d.getTime())?d.toISOString():fail();
function validateOriginal(d,now){
 if(!d||typeof d!=="object"||Array.isArray(d)||
   !clean(d.source_id)||!clean(d.originating_organization_id)||
   !urlValid(d.original_url)||!privilegeFree(d.original_url)||
   !SHA.test(d.original_article_sha256)||!SHA.test(d.same_event_claim_sha256)||
   !COUNTRY.test(d.country_iso3)||!CATEGORIES.has(d.category)||
   !Number.isFinite(epoch(d.original_published_at)))fail();
 if(epoch(d.original_published_at)>now+10*60000)fail();
 if(Object.keys(d).some(k=>/(?:^|_)(?:secret|private[_-]?key|api[_-]?key|access[_-]?key|credential|token|password|authorization)(?:_|$)/iu.test(k)))
   fail();
 // No allowance for plausible quoted source snippets masquerading as
 // first-party original content. Here only cryptographic references exist.
 if(d.article_text||d.raw_body||d.full_html||d.license_text)fail();
}
function analyzeCatalogue(id){
 const entry=COMMERCIAL_SOURCE_RIGHTS_EVIDENCE[id];
 if(!entry)return {
  source_contract_state:"NO_VERIFIED_SOURCE_LICENSE",
  source_reuse_decision:"UNKNOWN_PERMISSION",
  attribution_required:"UNKNOWN",
  source_license_document_url:null,
  original_article_commercial_rights_verified:false,
 };
 const allowed=["VERIFIED","DERIVED_ONLY"].includes(entry.approved_status);
 // USGS-authored government works generally are U.S. public domain and USGS
 // asks for credit, but pages can embed separately copyrighted third-party
 // material. This special case is a review opportunity, NEVER auto-approval.
 const usgsOwnedScope=PUBLIC_DOMAIN_SOURCE_IDS.has(id)&&
    entry.licence?.includes("U.S. public domain")===true;
 return {
  source_contract_state:allowed?"VERSIONED_DATASET_LICENSE_RECORDED":"NOT_VERIFIED",
  source_reuse_decision:!allowed?"UNKNOWN_PERMISSION":
    usgsOwnedScope?"PUBLIC_DOMAIN_ORIGINAL_SCOPE_REVIEW_REQUIRED":
    entry.attribution_required===true?"ATTRIBUTION_REQUIRES_DISCLOSURE":
    "SOURCE_SCOPE_REVIEW_REQUIRED",
  attribution_required:usgsOwnedScope?"PUBLIC_DOMAIN_CREDIT_REQUESTED_EXACT_SCOPE_REVIEW":
    entry.attribution_required===true,
  source_license_document_url:typeof entry.terms_url==="string"?entry.terms_url:null,
  original_article_commercial_rights_verified:false,
 };
}
function validatePermissionEvidence(original,p,now){
 if(!p||typeof p!=="object"||Array.isArray(p))return false;
 if(p.source_id!==original.source_id||
   p.original_article_sha256!==original.original_article_sha256||
   !SHA.test(p.permission_document_sha256)||!SHA.test(p.licensed_article_scope_sha256)||
   p.commercial_derived_use_requested!==true||
   p.raw_redistribution_requested!==false||
   p.no_attribution_claimed!==true||
   p.third_party_components_excluded!==true||
   typeof p.legal_basis!=="string"||
   !["ARTICLE_SPECIFIC_WRITTEN_PERMISSION",
      "SCOPED_PUBLIC_DOMAIN_WITH_THIRD_PARTY_EXCLUDED"].includes(p.legal_basis))
   return false;
 const verified=epoch(p.rights_document_reviewed_at);
 const expires=epoch(p.rights_document_expires_at);
 return Number.isFinite(verified)&&Number.isFinite(expires)&&
  verified<=now&&expires>now&&expires-verified<=366*86400000;
}
const dedupeKey=x=>hash([x.source_id,x.originating_organization_id,
 x.original_url,x.original_article_sha256].join("\n"));
const approvalState=(entry,proofReady,age)=>{
 if(age>6*3600000)return "ORIGINAL_TOO_OLD_FOR_CURRENT_GRO";
 if(entry.source_reuse_decision==="PUBLIC_DOMAIN_ORIGINAL_SCOPE_REVIEW_REQUIRED")
   return "PUBLIC_DOMAIN_AND_THIRD_PARTY_COMPONENTS_REVIEW_REQUIRED";
 if(entry.source_reuse_decision==="ATTRIBUTION_REQUIRES_DISCLOSURE")
   return "ATTRIBUTION_INCOMPATIBLE_WITH_PRIVATE_DELIVERY";
 if(entry.source_reuse_decision==="UNKNOWN_PERMISSION")
   return "PUBLISHER_OR_DATASET_PERMISSION_REQUEST_REQUIRED";
 if(proofReady)return "ARTICLE_SCOPE_PROOF_FOR_INDEPENDENT_RIGHTS_REVIEW";
 return "ARTICLE_SCOPE_RIGHTS_DOCUMENT_REQUIRED";
};
export function planGeomacroCommercialRightsIntake(
 observations,{now=new Date(),permissions=[],declaredDirectoryCount=779}={}){
 const when=now instanceof Date?now.getTime():NaN;
 if(!Number.isFinite(when)||!Array.isArray(observations)||observations.length>MAX_ITEMS||
  !Array.isArray(permissions)||permissions.length>MAX_SOURCES||observations.length===0||
  !Number.isSafeInteger(declaredDirectoryCount)||declaredDirectoryCount<0)fail();
 const verifiedAt=stamp(now);
 const perms=new Map();
 for(const p of permissions){
  if(!p||!clean(p.source_id)||!SHA.test(p.original_article_sha256)||p.rights_owner_signature)
   fail(); // A fake/unsigned rights-owner proof is never accepted by intake.
  const key=p.source_id+":"+p.original_article_sha256;
  if(perms.has(key))fail();
  perms.set(key,p);
 }
 const seenArticles=new Set(),seenOrigins=new Map(),seenIssueUrl=new Map(),seenClaimIssuer=new Set();
 const rows=[],dup=[];
 for(const d of observations){
  validateOriginal(d,when);
  const exact=dedupeKey(d);
  // An identical article body, same issuer+canonical URL, or same issuer
  // syndicating a claim cannot become independently corroborating originals.
  const sameBody=seenArticles.has(d.original_article_sha256);
  const issuerUrl=d.originating_organization_id+"|"+d.original_url;
  const sameUrl=seenOrigins.has(issuerUrl);
  const issuerClaim=d.originating_organization_id+"|"+d.same_event_claim_sha256;
  const sameClaim=seenClaimIssuer.has(issuerClaim);
  if(sameBody||sameUrl||sameClaim){
   dup.push({deduped_record_sha256:exact,reason:sameBody?"REPEATED_ARTICLE_BYTES":
    sameUrl?"SAME_ISSUER_URL":"SAME_ISSUER_CLAIM"});
   continue;
  }
  seenArticles.add(d.original_article_sha256);
  seenOrigins.set(issuerUrl,true);
  seenClaimIssuer.add(issuerClaim);
  const entry=analyzeCatalogue(d.source_id);
  const evidence=perms.get(d.source_id+":"+d.original_article_sha256);
  const proofReady=validatePermissionEvidence(d,evidence,when);
  const age=when-epoch(d.original_published_at);
  const queueState=approvalState(entry,proofReady,age);
  rows.push({
   item_id_sha256:exact,
   source_id:d.source_id,
   originating_organization_id:d.originating_organization_id,
   original_article_sha256:d.original_article_sha256,
   same_event_claim_sha256:d.same_event_claim_sha256,
   country_iso3:d.country_iso3,category:d.category,
   original_published_at:d.original_published_at,
   source_contract_state:entry.source_contract_state,
   source_reuse_decision:entry.source_reuse_decision,
   attribution_required:entry.attribution_required,
   rights_licence_terms_url:entry.source_license_document_url,
   permission_evidence_present:proofReady,
   rights_request:queueState==="PUBLISHER_OR_DATASET_PERMISSION_REQUEST_REQUIRED"||
     queueState==="ARTICLE_SCOPE_RIGHTS_DOCUMENT_REQUIRED"||
     queueState==="ATTRIBUTION_INCOMPATIBLE_WITH_PRIVATE_DELIVERY" ?{
      kind:"GEOMACRO_PRIVATE_REQUEST_FOR_COMMERCIAL_DERIVED_USE",
      exact_original_article_sha256:d.original_article_sha256,
      exact_public_url:d.original_url,
      grant_needed:"RIGHTS_HOLDER_PERMISSION_FOR_SOURCE_PRIVATE_DERIVED_COMMERCIAL_FACTS",
      raw_article_redistribution_requested:false,
      no_attribution_or_attribution_exception_requested:true,
      rights_holder_reply_received:false,
      permissions_created_by_geomacro:false,
     }:null,
   disposition:queueState,
   real_issuer_contents_reread_verified:false,
   facts_authority_signed:false,
   rights_authority_signed:false,
   source_legal_permission_certified:false,
   production_gro_signed:false,
   paid_product_published:false,
  });
 }
 const byClaim=new Map();
 for(const item of rows){
  const key=item.category+"|"+item.country_iso3+"|"+item.same_event_claim_sha256;
  const xs=byClaim.get(key)||[];
  xs.push(item);byClaim.set(key,xs);
 }
 const groups=[...byClaim].sort(([a],[b])=>a.localeCompare(b)).map(([key,arr])=>{
  const orgs=new Set(arr.map(x=>x.originating_organization_id));
  const independent=orgs.size>=2 && arr.length>=2;
  // Only a candidate: rights/clock/actual content, semantic contradiction,
  // distinct authority signatures must still be checked independently.
  return {
   claim_id_sha256:hash(key),
   category:arr[0].category,country_iso3:arr[0].country_iso3,
   independent_source_candidate_count:orgs.size,
   independent_multiple_originals_candidate:independent,
   source_private_rights_pending:arr.some(x=>x.disposition!=="ARTICLE_SCOPE_PROOF_FOR_INDEPENDENT_RIGHTS_REVIEW"),
   factual_semantic_review_pending:true,third_party_rights_approved:false,
   facts_and_rights_signatures_present:false,
   gro_signing_allowed:false,
  };
 });
 const statusTotals={};
 for(const r of rows)statusTotals[r.disposition]=(statusTotals[r.disposition]||0)+1;
 return Object.freeze({
  schema:RIGHTS_INTAKE_SCHEMA,generated_at:verifiedAt,
  declared_private_source_directory_rows:declaredDirectoryCount,
  catalogue_source_count:Object.keys(COMMERCIAL_SOURCE_RIGHTS_EVIDENCE).length,
  candidate_originals_received:observations.length,
  unique_originals:rows.length,duplicates_removed:dup.length,
  rights_dispositions:statusTotals,
  countries_in_queue:[...new Set(rows.map(x=>x.country_iso3))].length,
  event_claim_candidates:groups.length,
  groups,items:rows,duplicates:dup,
  issuer_facts_signatures_created:0,
  issuer_rights_signatures_created:0,gro_signatures_created:0,
  real_source_legal_rights_created:0,
  owner_derived_output_license_separate_from_upstream:true,
  all_source_licenses_automatically_granted:false,
  customer_source_identities_disclosed:false,
  paid_launch_ready:false,raw_news_to_customers:false,
  supabase_requests:0,b2_requests:0,d1_writes:0,payments:0,
 });
}
export function privateRightsIntakePublicSummary(plan){
 if(plan?.schema!==RIGHTS_INTAKE_SCHEMA)fail();
 const {items,groups,duplicates,...publicParts}=plan;
 return Object.freeze({...publicParts,
  private_items_redacted:true,
  private_groups_redacted:true,
  private_original_uris_redacted:true,
  private_legal_documents_redacted:true,
 });
}
