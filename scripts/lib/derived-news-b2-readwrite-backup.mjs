/** One genuine, bounded, private B2 backup of SAME D1 newsroom rows.
 * This never generates news, rescues stale items, certifies rights, signs
 * GRI or replaces D1 as public Intelligence's primary read path.
 */
import {createHash} from "node:crypto";
import {gzipSync,gunzipSync} from "node:zlib";
import {verifyDerivedStory} from "../../workers/control-plane/src/website-derived-intelligence.mjs";
import {isSafeDerivedNewsReadbackSignal} from "./derived-news-readback-policy.mjs";

const ORIGIN="https://geomacro-control-plane.daspallab202391.workers.dev";
const BASE=ORIGIN+"/v1/public/website-derived-news-bundle";
const PREFIX="geomacro-evidence/v1/private/derived-news-journal/";
const CATEGORIES=["geopolitics","macro","rare_earth"];
const MAX_BUNDLE_BYTES=1_800_000,MAX_RAW_BYTES=1_800_000,MAX_GZIP_BYTES=350_000;
const sha=b=>createHash("sha256").update(b).digest("hex");
const fail=code=>{throw Error("DERIVED_NEWS_B2_"+code)};

// One canonical D1 read replaces three overlapping, non-atomic OFFSET pages.
// Cache-Control:no-cache is essential: the public route then bypasses
// both per-POP cache and optional R2 snapshots, preserving independent
// canonical D1 readback rather than mistaking a stale offload for a backup.
async function strictBundle(response){
 if(response?.status!==200||response.redirected||
    Number(response.headers?.get("content-length")??0)>MAX_BUNDLE_BYTES||
    response.headers?.has("X-GeoMacro-Public-Offload")||
    response.headers?.has("X-GeoMacro-Canonical-Status"))
  fail("D1_CANONICAL_BUNDLE_UNAVAILABLE");
 let text;
 try{text=await response.text();}catch{fail("D1_PUBLIC_BODY_UNAVAILABLE");}
 if(text.length>MAX_BUNDLE_BYTES)fail("D1_PUBLIC_BUNDLE_OVERSIZE");
 let doc;try{doc=JSON.parse(text);}catch{fail("D1_PUBLIC_JSON_INVALID");}
 if(doc?.ok!==true||doc.schema!=="geomacro.website-derived-news-bundle.v1"||
    doc.delivery_scope!=="free_website_only"||doc.retention_hours!==72||
    doc.original_release_delay_minutes!==0||doc.complete!==true||
    doc.item_cap!==600||!Number.isSafeInteger(doc.returned_rows)||
    !Array.isArray(doc.signals)||doc.signals.length>600||
    doc.returned_rows!==doc.signals.length||
    !Array.isArray(doc.first_ingest)||
    doc.first_ingest.length!==doc.signals.length)
  fail("D1_CANONICAL_BUNDLE_CONTRACT_INVALID");
 return doc;
}
export async function readExactCurrentDerivedJournal({fetchImpl=fetch,now=new Date()}={}){
 const epoch=now.getTime();if(!Number.isFinite(epoch))fail("CLOCK_INVALID");
 let response;
 try{
  response=await fetchImpl(BASE,{
    method:"GET",redirect:"error",cache:"no-store",
    headers:{Accept:"application/json","Cache-Control":"no-cache",Pragma:"no-cache"},
    signal:AbortSignal.timeout(12_000)
  });
 }catch{fail("D1_PUBLIC_READBACK_UNAVAILABLE");}
 const bundle=await strictBundle(response);
 const checked=Date.parse(bundle.checked_at);
 if(!Number.isFinite(checked)||Math.abs(checked-epoch)>5*60_000)
  fail("D1_CANONICAL_BUNDLE_CLOCK_INVALID");
 const rows=[],seen=new Set();
 for(const row of bundle.signals){
  if(!verifyDerivedStory(row,epoch)||!isSafeDerivedNewsReadbackSignal(row)||
     seen.has(row.id)||Date.parse(row.published_at)<epoch-72*3_600_000||
     (row.status==="official_feed_candidate_unscored"&&
      !row.topic.endsWith(" publisher candidate")))
   fail("D1_SIGNAL_SCOPE_INVALID");
  seen.add(row.id);rows.push(row);
 }
 return rows;
}
export function buildDerivedJournalB2Plan(rows,now=new Date()){
 if(!Number.isFinite(now.getTime())||!Array.isArray(rows)||
    rows.length>600||new Set(rows.map(x=>x?.id)).size!==rows.length)
   fail("ARCHIVE_INPUT_INVALID");
 const nowMs=now.getTime();
 if(rows.some(row=>!verifyDerivedStory(row,nowMs)||!isSafeDerivedNewsReadbackSignal(row)||
    Date.parse(row.published_at)<nowMs-72*3_600_000))
   fail("ARCHIVE_SIGNAL_UNQUALIFIED");
 if(rows.length===0)return null; // no fabricated empty event/backup
 // Stable category+id order, so identical source observations yield the same
 // gzip bytes within a run even if concurrent D1 page order changes.
 const sorted=[...rows].sort((a,b)=>a.id.localeCompare(b.id));
 const doc={
  schema:"geomacro.private-derived-news-journal-b2.v1",
  origin:"SAME_72H_D1_ROWS_AS_PUBLIC_INTELLIGENCE",
  snapshot_as_of:now.toISOString(),
  observation_window_hours:72,website_delay_minutes:0,
  rights_reviewed:false,independent_gri_reviewed:false,
  signed_hot_product:false,commercial_resale_authorized:false,
  raw_original_content_stored:false,
  source_original_urls_stored:false,payment_required:false,
  category_counts:Object.fromEntries(CATEGORIES.map(c=>[c,sorted.filter(s=>s.category===c).length])),
  record_count:sorted.length,signals:sorted
 };
 const raw=Buffer.from(JSON.stringify(doc),"utf8");
 if(raw.length>MAX_RAW_BYTES)fail("ARCHIVE_RAW_OVERSIZE");
 const compressed=gzipSync(raw,{level:9,mtime:0});
 if(compressed.length<40||compressed.length>MAX_GZIP_BYTES)
  fail("ARCHIVE_GZIP_OVERSIZE");
 const key=PREFIX+now.toISOString().slice(0,10).replaceAll("-","/")+
  "/"+sha(compressed)+".json.gz";
 return Object.freeze({key,compressed,compressed_sha256:sha(compressed),
  raw_sha256:sha(raw),record_count:sorted.length,category_counts:doc.category_counts});
}
export function verifyDerivedJournalB2Restore(bytes,plan){
 if(!plan||!Buffer.isBuffer(bytes)||bytes.length>MAX_GZIP_BYTES||
    sha(bytes)!==plan.compressed_sha256||
    bytes.length!==plan.compressed.length||
    !bytes.equals(plan.compressed))
  fail("B2_EXACT_COMPRESSED_READBACK_INVALID");
 let restored;
 try{restored=gunzipSync(bytes,{maxOutputLength:MAX_RAW_BYTES});}
 catch{fail("B2_GZIP_RESTORE_INVALID");}
 if(sha(restored)!==plan.raw_sha256)fail("B2_RESTORED_SHA256_MISMATCH");
 let doc;try{doc=JSON.parse(restored.toString("utf8"));}
 catch{fail("B2_RESTORED_JSON_INVALID");}
 if(doc?.schema!=="geomacro.private-derived-news-journal-b2.v1"||
    doc.signed_hot_product!==false||
    doc.commercial_resale_authorized!==false||
    doc.raw_original_content_stored!==false||
    doc.record_count!==plan.record_count||
    JSON.stringify(doc.category_counts)!==JSON.stringify(plan.category_counts)||
    !Array.isArray(doc.signals)||doc.signals.length!==plan.record_count)
   fail("B2_RESTORED_SCOPE_INVALID");
 return true;
}
export async function archiveDerivedJournalToB2({
 fetchImpl=fetch,b2,now=new Date(),force=false
}={}){
 if(!Number.isFinite(now.getTime()))fail("CLOCK_INVALID");
 // Only four fixed UTC slots per day (00/06/12/18). Max 8 normal B2
 // operations/day instead of 48, preserving the account-wide 100-op
 // governed free ceiling and headroom for signed GRI and hot recovery.
 if(!force&&now.getUTCHours()%6!==0)
  return {schema:"geomacro.private-derived-news-b2-backup-receipt.v1",
    status:"SKIPPED_SIX_HOUR_ARCHIVE_SLOT",archived_rows:0,
    b2_put_verified:false,source_d1_readback_verified:false,
    public_website_unchanged:true,payments:0};
 const rows=await readExactCurrentDerivedJournal({fetchImpl,now});
 const plan=buildDerivedJournalB2Plan(rows,now);
 if(!plan)return {schema:"geomacro.private-derived-news-b2-backup-receipt.v1",
   status:"SKIPPED_NO_QUALIFYING_D1_NEWS",archived_rows:0,
   b2_put_verified:false,source_d1_readback_verified:true,
   public_website_unchanged:true,payments:0};
 if(!b2?.putWithMetadataVerification)fail("GOVERNED_READ_WRITE_B2_REQUIRED");
 const proof=await b2.putWithMetadataVerification(plan.key,plan.compressed,{
   verifyRestored:async bytes=>verifyDerivedJournalB2Restore(bytes,plan)
 });
 if(proof?.full_body_readback_verified!==true||
    proof.sha256!==plan.compressed_sha256||
    proof.bytes!==plan.compressed.length)
   fail("B2_PUT_GET_SHA_ACK_INVALID");
 // Independently repeat the full GET through the unchanged atomic quota
 // governor. This is a genuine second provider operation, not a cached
 // digest or the first readback returned by putWithMetadataVerification.
 if(typeof b2.get!=="function")fail("SECOND_INDEPENDENT_GET_REQUIRED");
 const secondBytes=await b2.get(plan.key);
 verifyDerivedJournalB2Restore(secondBytes,plan);
 return {schema:"geomacro.private-derived-news-b2-backup-receipt.v1",
  status:"B2_PUT_FULL_GET_RESTORED_SHA_VERIFIED",
  archived_rows:plan.record_count,category_counts:plan.category_counts,
  archive_object_key:plan.key,compressed_sha256:plan.compressed_sha256,
  raw_sha256:plan.raw_sha256,
  b2_put_verified:true,b2_exact_readback_verified:true,
  independent_second_get_verified:true,
  second_get_sha256:plan.compressed_sha256,
  restored_json_verified:true,source_d1_readback_verified:true,
  same_news_as_intelligence_d1:true,
  public_website_unchanged:true,raw_original_content_stored:false,
  independent_gri_signed:false,rights_verified:false,
  paid_eligible:false,d1_writes:0,supabase_writes:0,payments:0};
}
