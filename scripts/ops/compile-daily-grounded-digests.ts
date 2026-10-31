#!/usr/bin/env bun
/**
 * Daily 00:00 UTC, private, zero-funds compiler. D1 canonical raw rows are
 * used ONLY AFTER existing quota-governed B2 PUT, two exact GETs, and D1
 * archive SHA acknowledgement. This is NOT a competing archive writer.
 *
 * Revenue registration requires the existing signed/rights-qualified Store
 * producer and buyer route. A SHA256 content ID is NOT an Ed25519 signature.
 */
import {createHash} from "node:crypto";
import {mkdirSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {COUNTRIES_195} from "../../src/lib/canonical-country-registry-195";
import {gradeArchivedPhase2hEvidence,EVIDENCE_DRAFT_TTL_HOURS,
 type Phase2hArchivedRow,type EvidenceGrade,type GradedCategory}
 from "../../src/pipelines/evidence-grader";

const CATEGORIES=["geopolitics","macro","rare_earth"] as const;
const SHA=/^[a-f0-9]{64}$/u;
const MAX_ROWS=240,DAY=86400_000;
const hash=(s:string)=>createHash("sha256").update(s).digest("hex");
const fail=(code:string):never=>{throw Error("DAILY_EVIDENCE_DIGEST_"+code)};
type DigestInput=Readonly<{now:Date;rows:Phase2hArchivedRow[];fullScan:boolean}>;
export function compilePhase2hDailyCountryDigest({now,rows,fullScan}:DigestInput){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime())||
    !Array.isArray(rows)||rows.length>MAX_ROWS+1||typeof fullScan!=="boolean")
  fail("INPUT_INVALID");
 const grades:EvidenceGrade[]=[];
 const seen=new Set<string>();
 for(const row of rows){
  if(!SHA.test(row?.record_id??"")||seen.has(row.record_id))
   fail("DUPLICATE_OR_INVALID_ORIGINAL_ID");
  seen.add(row.record_id);
  grades.push(gradeArchivedPhase2hEvidence(row,now));
 }
 // 195x3 routing grid is a COMPLETE list of possible cells, never a claim
 // of 585 independently evidenced countries/categories.
 const cells=COUNTRIES_195.flatMap(country=>
   CATEGORIES.map(category=>{
    const matches=grades.filter(g=>g.country_iso3===country.iso3&&
      g.domain_category===category&&g.archive_ack_verified);
    const current=matches.filter(g=>g.published_utc&&
      now.getTime()-Date.parse(g.published_utc)<=48*3600_000);
    const grounded=current.filter(g=>g.grounding_status==="EVIDENCE_GROUNDED");
    const lifetime=current.length?48:0;
    const status=current.length===0&&matches.length>0?"STALE_BASE_ONLY":
      grounded.length>0?"EVIDENCE_GROUNDED_REVIEW_REQUIRED":
      "NO_PAYABLE_EVIDENCE";
    const digestContent={
      schema:"geomacro.private-country-category-digest.v1",
      country_iso3:country.iso3,domain_category:category,
      source_count:matches.length,
      freshness_ttl_hours:lifetime,
      // Original sourced five-part FACTS, never placeholder numbers.
      current_events:current.map(x=>({
       evidence_id:x.record_id,source_url:x.source_url,
       published_utc:x.published_utc,what_happened:x.what_happened,
       why_it_matters:x.why_it_matters,
       quantifiable_metrics:x.quantified_metrics,
       grounding_score:x.confidence_score,
       grounding_status:x.grounding_status,
       archive_id:x.archive_id,
      })).sort((a,b)=>a.evidence_id.localeCompare(b.evidence_id)),
    };
    const content_hash=hash(JSON.stringify(digestContent));
    return {...digestContent,content_hash,
      status:status==="EVIDENCE_GROUNDED_REVIEW_REQUIRED"&&
        matches.some(x=>!x.item_commercial_rights_verified)?
        "EVIDENCE_GROUNDED_REVIEW_REQUIRED":status,
      // Source claims, rights and signing must be separately admitted by
      // existing paid Store / x402; compiler cannot approve or charge.
      cryptographic_signature_verified:false,
      signing_required_before_catalog_promotion:true,
      existing_paid_store_qualification_verified:false,
      catalog_price_mutated:false,
      quote_authorized:false,credit_deducted:false,
    };
  }));
 const full=fullScan&&rows.length<=MAX_ROWS;
 // Explain every no-charge disposition from the ACTUAL archived source
 // rows, not invented 585-cell coverage. Counts only; do not log privately
 // observed URLs, news titles, country/source IDs, or raw source payloads.
 const emptyCategory=()=>({archived:0,quantified_candidates:0,grounded:0,
  unqualified:0,failed_by_reason:{} as Record<string,number>});
 const category_qualification_census:Record<string,ReturnType<typeof emptyCategory>>={
  geopolitics:emptyCategory(),macro:emptyCategory(),rare_earth:emptyCategory(),
 };
 for(const grade of grades){
  if(!grade.domain_category)continue;
  const q=category_qualification_census[grade.domain_category];
  if(!grade.archive_ack_verified)continue;
  q.archived++;
  if(grade.quantified_metrics.length)q.quantified_candidates++;
  if(grade.grounding_status==="EVIDENCE_GROUNDED")q.grounded++;
  else q.unqualified++;
  for(const code of grade.failure_codes){
   if(!/^[A-Z_]{3,75}$/u.test(code))throw Error("DAILY_DIGEST_REASON_INVALID");
   q.failed_by_reason[code]=(q.failed_by_reason[code]??0)+1;
  }
 }
 const counts={
  archived_rows_read:rows.length,
  archived_rows_valid:grades.filter(x=>x.archive_ack_verified).length,
  original_numeric_candidate_count:grades.filter(x=>x.quantified_metrics.length>0).length,
  evidence_grounded_count:grades.filter(x=>x.grounding_status==="EVIDENCE_GROUNDED").length,
  free_public_news_count:grades.filter(x=>x.grounding_status==="FREE_PUBLIC_NEWS").length,
  country_cells_with_archived_observations:cells.filter(x=>x.source_count>0).length,
  cells_awaiting_real_paid_qualification:cells.filter(x=>x.status==="EVIDENCE_GROUNDED_REVIEW_REQUIRED").length,
 };
 return {
  schema:"geomacro.phase2h.daily-private-evidence-digest.v1",
  generated_at:now.toISOString(),scope:"PRIVATE_NO_FUNDS",
  country_grid_size:COUNTRIES_195.length*3,
  canonical_d1_scan_complete:full,
  canonical_d1_limit:MAX_ROWS,
  source_archive_retention_hours:EVIDENCE_DRAFT_TTL_HOURS,
  digest_current_freshness_hours:48,
  b2_archive_proof_type:"EXISTING_B2_TWO_GET_AND_CANONICAL_D1_SHA_ACK",
  no_b2_readback_claim_by_this_job:true,
  raw_original_articles_delivered:false,
  // 5-part news drafts are not Store modules. Do not edit pricing catalog,
  // no automatically signed GRO, no real-money checkout or credit deductions.
  domain_names:["geopolitics","macro","rare_earth"],
  counts,category_qualification_census,cells,paid_delivery_authorized:false,payment_attempted:false,
 };
}
export async function readDailyArchiveFromCanonicalD1({
 env=process.env,now=new Date(),fetchImpl=fetch,
}:{env?:NodeJS.ProcessEnv;now?:Date;fetchImpl?:typeof fetch}={}){
 if(!Number.isFinite(now.getTime())||
  !/^[a-f0-9]{32}$/u.test(env.CLOUDFLARE_ACCOUNT_ID??"")||
  !/^[a-f0-9-]{36}$/iu.test(env.D1_DATABASE_ID??"")||
  (env.CLOUDFLARE_API_TOKEN??"").length<20)
  fail("CANONICAL_D1_PROTECTED_CONFIG_MISSING");
 const endpoint="https://api.cloudflare.com/client/v4/accounts/"+
  env.CLOUDFLARE_ACCOUNT_ID+"/d1/database/"+env.D1_DATABASE_ID+"/query";
 const start=new Date(now.getTime()-72*3600_000).toISOString();
 // A 241-row raw_json response can exceed Cloudflare's D1 provider API
 // response-size limit (the same failure repaired in Phase2H PR #3267).
 // Eight original rows per request is <=96 KiB; keyset pagination avoids
 // OFFSET instability and never re-reads a raw row. Once capped, say so.
 const pageSize=8;
 const rows:Phase2hArchivedRow[]=[];
 let cursor:{published:string;id:string}|null=null;
 const seen=new Set<string>();
 while(rows.length<=MAX_ROWS){
  const paging=cursor!==null;
  const sql="SELECT record_id,category,raw_sha256,raw_json,"+
   "b2_object_sha256,b2_archived_at,original_published_at,first_ingested_at "+
   "FROM phase2h_private_raw_news WHERE b2_object_sha256 IS NOT NULL "+
   "AND b2_archived_at IS NOT NULL AND b2_archived_at <= ? "+
   "AND original_published_at >= ? "+
   (paging?"AND (original_published_at < ? OR (original_published_at = ? AND record_id > ?)) ":"")+
   "ORDER BY original_published_at DESC,record_id LIMIT ?";
  const params=paging
    ?[now.toISOString(),start,cursor!.published,cursor!.published,cursor!.id,pageSize]
    :[now.toISOString(),start,pageSize];
  const res=await fetchImpl(endpoint,{method:"POST",redirect:"error",
   headers:{"Authorization":"Bearer "+env.CLOUDFLARE_API_TOKEN,
    "Content-Type":"application/json"},
   body:JSON.stringify({sql,params}),
   signal:AbortSignal.timeout(15000)});
  const doc=await res.json().catch(()=>null);
  const result=doc?.result?.[0];
  if(!res.ok||doc?.success!==true||result?.success===false||
    !Array.isArray(result?.results)||result.results.length>pageSize)
   fail("CANONICAL_D1_PAGE_UNAVAILABLE");
  for(const item of result.results as Phase2hArchivedRow[]){
   if(typeof item.record_id!=="string"||!SHA.test(item.record_id)||
      typeof item.raw_json!=="string"||item.raw_json.length>12000||
      typeof item.original_published_at!=="string"||
      seen.has(item.record_id))
    fail("CANONICAL_D1_PAGE_INVALID");
   seen.add(item.record_id);rows.push(item);
  }
  if(result.results.length<pageSize)break;
  const last=result.results[result.results.length-1] as Phase2hArchivedRow;
  cursor={published:last.original_published_at,id:last.record_id};
  if(rows.length>MAX_ROWS)break;
 }
 return {rows,fullScan:rows.length<=MAX_ROWS};
}
export async function runDailyEvidenceDigest({
 env=process.env,now=new Date(),read=readDailyArchiveFromCanonicalD1,
}:{env?:NodeJS.ProcessEnv;now?:Date;read?:typeof readDailyArchiveFromCanonicalD1}={}){
 if(env.GITHUB_ACTIONS!=="true"||
   env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
   env.GITHUB_REF!=="refs/heads/main"||
   env.GITHUB_EVENT_NAME!=="schedule"||
   env.GEOMACRO_DAILY_DIGEST_QUOTA_ADMITTED!=="true")
  fail("TRUSTED_SCHEDULE_AND_D1_QUOTA_REQUIRED");
 const {rows,fullScan}=await read({env,now});
 const digest=compilePhase2hDailyCountryDigest({now,rows,fullScan});
 mkdirSync("artifacts/private-daily-intelligence",{recursive:true,mode:0o700});
 const output=resolve("artifacts/private-daily-intelligence/country-category-digest.json");
 writeFileSync(output,JSON.stringify(digest)+"\n",{mode:0o600});
 const receipt={schema:digest.schema,
  generated_at:digest.generated_at,counts:digest.counts,
  category_qualification_census:digest.category_qualification_census,
  complete:digest.canonical_d1_scan_complete,
  status:!fullScan?"INCOMPLETE_BOUNDED_D1_SCAN":
    digest.counts.evidence_grounded_count>0?
    "PRIVATE_GROUNDED_DRAFTS_NOT_YET_PAYABLE":"NO_PAYABLE_EVIDENCE",
  source_grants_verified:false,payable_products_created:0,
  x402_quotes_created:0,credits_deducted:0,
  actual_independent_b2_readback_this_run:false};
 writeFileSync("artifacts/private-daily-intelligence/receipt.json",
  JSON.stringify(receipt)+"\n",{mode:0o600});
 console.log(JSON.stringify(receipt));
 if(!fullScan)process.exitCode=3;
 return receipt;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
 runDailyEvidenceDigest().catch(e=>{
  const m=e instanceof Error?e.message:"";
  console.error(/^DAILY_EVIDENCE_DIGEST_[A-Z0-9_]+$/u.test(m)?m:
    "DAILY_EVIDENCE_DIGEST_UNVERIFIED");
  process.exitCode=3;
 });
