import {createHash} from "node:crypto";
import {fileURLToPath} from "node:url";

/**
 * Read-only outside-in proof after protected GRI->indices publication.
 * The page/UI never calls this and no source tokens or raw articles appear
 * in its receipt. Runs only after a genuine signed D1 indices promotion.
 */
const D1="https://geomacro-control-plane.daspallab202391.workers.dev/v1/public/hot-snapshot/risk-indices";
const EDGE="https://geomacro-risk-indices.daspallab202391.workers.dev/risk-indices";
const HASH=/^[a-f0-9]{64}$/u;
const REQUIRED=new Map([
 ["geopolitics","geopolitics"],["macro","macro"],
 ["critical_minerals","rare_earth"]
]);
const sha=s=>createHash("sha256").update(s).digest("hex");
const fail=code=>{throw Error("INDICES_LIVE_CONTINUITY_"+code);};
async function getJson(url,fetchImpl){
 let r;
 try{
  r=await fetchImpl(url,{method:"GET",redirect:"error",cache:"no-store",
   headers:{accept:"application/json","cache-control":"no-cache"},
   signal:AbortSignal.timeout(15000)});
 }catch{fail("TRANSPORT_UNAVAILABLE");}
 if(r.status!==200||r.redirected)fail("HTTP_UNAVAILABLE");
 const raw=await r.text();
 if(!raw||raw.length>1024*1024)fail("BODY_INVALID");
 let value;try{value=JSON.parse(raw);}catch{fail("JSON_INVALID");}
 return {value,headers:r.headers};
}
function checkIndexPackage(value,now){
 const data=value?.data;
 if(value?.schema!=="geomacro.public-risk-indices-live.v1"||
  value.source_project!=="ldpwajisioljyjtojvfx"||
  data?.contractVersion!=="risk-indices-v1.1.0"||
  data.parentMethodologyVersion!=="gri-v1.2.0"||
  data.proofScope!=="verified-category-projection"||
  data.verificationStatus!=="verified"||
  !HASH.test(String(data.proofHash??""))||
  !Array.isArray(data.indices)||data.indices.length!==3)
  fail("SIGNED_PACKAGE_INVALID");
 const source=Date.parse(data.snapshotAsOf);
 if(!Number.isFinite(source)||source>now+5*60_000||now-source>60*60_000)
  fail("NATIVE_CLOCK_EXPIRED");
 const categories=new Map(REQUIRED);
 for(const index of data.indices){
  if(!categories.has(index?.key)||categories.get(index.key)!==index.sourceCategory)
   fail("CATEGORY_IDENTITY_INVALID");
  categories.delete(index.key);
  const native=Date.parse(index.readingAsOf??"");
  if(index.status!=="available"||index.readingStatus!=="current"||
   !Number.isFinite(index.score)||index.score<0||index.score>100||
   !Number.isFinite(index.rawScore)||index.rawScore<0||index.rawScore>100||
   !Number.isFinite(native)||native>now+5*60_000||now-native>60*60_000||
   !index.readingSnapshotId||
   !Array.isArray(index.series?.["7D"]?.buckets)||
   index.series["7D"].buckets.length<2||
   !Array.isArray(index.series?.["30D"]?.buckets)||
   index.series["30D"].buckets.length<2)
   fail("CERTIFIED_DOMAIN_INCOMPLETE");
 }
 if(categories.size)fail("DOMAIN_MISSING");
 return data;
}
export async function verifyRiskIndicesLiveContinuity({fetchImpl=fetch,now=Date.now()}={}){
 if(!Number.isFinite(now))fail("CLOCK_INVALID");
 const d1=await getJson(D1,fetchImpl),snapshot=d1.value;
 if(snapshot.ok!==true||snapshot.product!=="risk-indices"||
  snapshot.schema!=="geomacro.public-risk-indices-live.v1"||
  snapshot.proof_schema!=="geomacro.public-risk-indices-live-proof.v1"||
  snapshot.verification_mode!=="direct-b2-readback"||
  snapshot.b2_object_key!=="geomacro-evidence/v1/live/risk-indices-independent/latest.json.gz"||
  snapshot.full_b2_readback_verified!==true||
  snapshot.current_b2_readback_verified!==true||
  snapshot.exact_gzip_restore_verified!==true||
  !HASH.test(String(snapshot.b2_sha256??""))||
  !HASH.test(String(snapshot.payload_sha256??""))||
  typeof snapshot.payload_json!=="string"||
  sha(snapshot.payload_json)!==snapshot.payload_sha256)
  fail("D1_SIGNED_PROOF_INVALID");
 let d1Package;try{d1Package=JSON.parse(snapshot.payload_json);}catch{fail("D1_PAYLOAD_INVALID");}
 const d1Data=checkIndexPackage(d1Package,now);
 const source=Date.parse(d1Data.snapshotAsOf);
 if(snapshot.source_as_of!==d1Data.snapshotAsOf||
  !Number.isFinite(Date.parse(snapshot.expires_at??""))||
  Date.parse(snapshot.expires_at)<=now||
  Date.parse(snapshot.expires_at)>source+180*60_000)
  fail("D1_SOURCE_CLOCK_INVALID");
 const edge=await getJson(EDGE,fetchImpl);
 if(edge.headers.get("x-geomacro-authority")!=="backblaze-b2-risk-indices-edge"||
    edge.headers.get("x-geomacro-native-clock-contract")!=="live-60m-v1"||
    edge.headers.get("x-geomacro-source-as-of")!==d1Data.snapshotAsOf)
  fail("EDGE_AUTHORITY_OR_CLOCK_INVALID");
 const edgeData=checkIndexPackage(edge.value,now);
 if(sha(JSON.stringify(edge.value))!==snapshot.payload_sha256||
  edgeData.snapshotId!==d1Data.snapshotId||
  edgeData.proofHash!==d1Data.proofHash)
  fail("EDGE_EXACT_D1_PAYLOAD_MISMATCH");
 return Object.freeze({ok:true,schema:"geomacro.risk-indices-live-continuity-acceptance.v1",
   source_as_of:d1Data.snapshotAsOf,three_independent_indices_verified:true,
   exact_d1_edge_payload_sha256:snapshot.payload_sha256,
   b2_readback_verified:true,d1_readback_verified:true,edge_readback_verified:true,
   raw_sources_logged:false,supabase_requests:0,b2_direct_requests:0,
   payment_transactions:0});
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 try{console.log(JSON.stringify(await verifyRiskIndicesLiveContinuity()));}
 catch(e){
  const code=String(e?.message??"");
  console.error(JSON.stringify({ok:false,error:/^INDICES_LIVE_CONTINUITY_[A-Z0-9_]+$/.test(code)
   ?code:"INDICES_LIVE_CONTINUITY_UNCLASSIFIED_FAILURE",payments:0}));
  process.exitCode=1;
 }
}
