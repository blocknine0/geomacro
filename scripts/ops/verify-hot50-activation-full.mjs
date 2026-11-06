#!/usr/bin/env node
/**
 * Owner-only outside-in PRODUCTION acceptance. No mock PASS, writes, funds,
 * Groq key rotation, source-rights promotion or synthetic index readings.
 * --redrive performs exactly one bounded existing CAS/queue recovery call.
 * --b2-list explicitly opts into independently listing the B2 spool prefix.
 */
import {createHash,createHmac,createPublicKey,verify} from "node:crypto";
import {fileURLToPath} from "node:url";
import {resolve} from "node:path";

const CONTROL="https://geomacro-control-plane.daspallab202391.workers.dev";
const EDGE="https://geomacro-risk-indices.daspallab202391.workers.dev/risk-indices";
const ASK="https://geomacro.live/api/public-ask";
const HASH=/^[a-f0-9]{64}$/u;
const b2Bytes=Buffer.alloc(0), sha=v=>createHash("sha256").update(v).digest("hex");
const results=[];
const record=(name,ok,details={})=>results.push({check:name,status:ok?"PASS":"FAIL",...details});
const fail=(code)=>{throw Error(code)};
const authToken=process.env.CONTROL_PLANE_TOKEN??"";
const withAuth=()=>authToken.length>=32?{"Authorization":"Bearer "+authToken}:fail("CONTROL_PLANE_TOKEN_MISSING");
async function read(url,options={}){
 const response=await fetch(url,{redirect:"error",cache:"no-store",
  signal:AbortSignal.timeout(20000),...options});
 const body=await response.text();
 if(body.length>150000)fail("AUDIT_RESPONSE_TOO_LARGE");
 let data;try{data=JSON.parse(body)}catch{fail("AUDIT_INVALID_JSON")}
 if(!response.ok||data?.ok===false)fail("HTTP_"+response.status+"_"+String(data?.error??data?.code??"UNAVAILABLE"));
 return {data,response};
}
const admin=(path,method="GET")=>read(CONTROL+path,{
 method,headers:{"accept":"application/json",...withAuth()}});
const GET=(path)=>admin(path);
function zero(v){return Number.isSafeInteger(v)&&v===0}
async function census(){
 const {data}=await GET("/v1/internal/activation/hot50-census");
 if(data.schema!=="geomacro.hot50-production-activation-census.v1"||
    data.cell_count!==150||data.country_count!==50)fail("CENSUS_SCHEMA_INVALID");
 return data;
}
async function redrive(){
 const r=(await admin("/v1/internal/activation/redrive","POST")).data;
 return {ok:r.ok===true, outbox:r.outbox, fifo:r.fifo, r2:r.r2};
}
async function verifyArchivePages(expected){
 let cursor="",total=0,items=0,pages=0,done=false;
 const MAX=Number(process.env.GEOMACRO_PARITY_MAX_PAGES??"10000");
 if(!Number.isSafeInteger(MAX)||MAX<1||MAX>100000)fail("MAX_PAGES_INVALID");
 while(pages<MAX){
  const path="/v1/internal/p0b/parity-verified-page?limit=2"+(cursor?"&after="+cursor:"");
  const r=(await GET(path)).data;
  if(r.schema!=="geomacro.p0b-all-archived-physical-parity.v1"||
     r.b2_independent_get_decrypt_sha256_verified!==true||
     r.d1_canonical_item_ack_readback_verified!==true||
     !Number.isSafeInteger(r.checked_bundles)||r.checked_bundles<0||
     !Number.isSafeInteger(r.checked_candidates)||r.checked_candidates<0)
     fail("PHYSICAL_PARITY_PROOF_INVALID");
  total+=r.checked_bundles;items+=r.checked_candidates;pages++;
  if(r.complete===true&&r.next_cursor===null){done=true;break}
  if(!HASH.test(r.next_cursor??"")||r.next_cursor===cursor)
    fail("PHYSICAL_PARITY_CURSOR_STALLED");
  cursor=r.next_cursor;
 }
 if(!done||total!==expected||total<1)fail("PHYSICAL_PARITY_EXHAUSTIVE_CENSUS_MISMATCH");
 return {archived_bundles_verified:total,canonical_items_verified:items,pages};
}
async function manifestRefs(expected){
 let cursor="",refs=new Set(),done=false,pages=0;
 while(pages<10000){
  const data=(await GET("/v1/internal/p0b/parity-manifest?limit=25"+(cursor?"&after="+cursor:""))).data;
  if(!data.ok||!Array.isArray(data.rows)||data.schema!=="geomacro.p0b-remote-manifest-page.v1")
   fail("D1_MANIFEST_INVALID");
  for(const row of data.rows){
   if(!HASH.test(row.batch_id??"")||!HASH.test(row.b2_object_sha256??"")||
      typeof row.b2_uri!=="string"||!row.b2_uri.startsWith("b2://")||
      refs.has(row.b2_uri))fail("D1_MANIFEST_DUPLICATE_OR_INVALID");
   refs.add(row.b2_uri);
  }
  pages++;
  if(data.complete===true&&data.next_cursor===null){done=true;break}
  if(!HASH.test(data.next_cursor??"")||cursor===data.next_cursor)fail("D1_MANIFEST_STALLED");
  cursor=data.next_cursor;
 }
 if(!done||refs.size!==expected||refs.size<1)fail("D1_MANIFEST_COUNT_MISMATCH");
 return refs;
}
function encode(s){return encodeURIComponent(s).replace(/[!'()*]/g,c=>"%"+c.charCodeAt(0).toString(16).toUpperCase())}
function hmac(k,s){return createHmac("sha256",k).update(s).digest()}
function b2Env(){
 const origin=new URL(String(process.env.B2_S3_ENDPOINT??""));
 if(origin.protocol!=="https:"||origin.pathname!=="/"||
    !/^s3\.[a-z0-9-]+\.backblazeb2\.com$/u.test(origin.hostname))
   fail("B2_ENDPOINT_UNTRUSTED");
 const bucket=String(process.env.B2_SPOOL_BUCKET??"");
 const prefix=String(process.env.B2_SPOOL_PREFIX??"spool/");
 if(!/^[a-z0-9][a-z0-9-]{2,63}$/u.test(bucket)||
    !/^(?:[a-zA-Z0-9._+-]+\/)*spool\/$/u.test(prefix)||
    !process.env.B2_KEY_ID||!process.env.B2_APPLICATION_KEY)
   fail("B2_MANIFEST_CONFIG_INVALID");
 return {origin,bucket,prefix,region:origin.hostname.slice(3,-".backblazeb2.com".length)};
}
function decodeXml(s){
 return s.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/g,entity=>{
  const known={"&amp;":"&","&lt;":"<","&gt;":">","&quot;":'"',"&apos;":"'"};
  if(known[entity])return known[entity];
  const n=entity.startsWith("&#x")?parseInt(entity.slice(3,-1),16):parseInt(entity.slice(2,-1),10);
  if(n<0||n>0x10ffff||!Number.isInteger(n))fail("B2_MANIFEST_XML_INVALID");
  return String.fromCodePoint(n);
 });
}
async function listB2(){
 const env=b2Env(), keys=new Set();
 let token=null,requests=0;
 const MAX=Number(process.env.GEOMACRO_B2_LIST_MAX_REQUESTS??"25");
 if(!Number.isSafeInteger(MAX)||MAX<1||MAX>1000)fail("B2_LIST_QUOTA_INVALID");
 do{
  if(requests>=MAX)fail("B2_LIST_QUOTA_CEILING");
  const query=[["list-type","2"],["max-keys","1000"],["prefix",env.prefix]];
  if(token!==null)query.push(["continuation-token",token]);
  const qs=query.sort((a,b)=>a[0].localeCompare(b[0])).map(([k,v])=>encode(k)+"="+encode(v)).join("&");
  const date=new Date().toISOString().replace(/[:-]|\.\d{3}/g,""),day=date.slice(0,8);
  const path="/"+encode(env.bucket),empty=sha(b2Bytes),host=env.origin.host;
  const signedHeaders="host;x-amz-content-sha256;x-amz-date";
  const canonicalHeaders="host:"+host+"\nx-amz-content-sha256:"+empty+"\nx-amz-date:"+date+"\n";
  const scope=day+"/"+env.region+"/s3/aws4_request";
  const canonical=["GET",path,qs,canonicalHeaders,signedHeaders,empty].join("\n");
  const string=["AWS4-HMAC-SHA256",date,scope,sha(canonical)].join("\n");
  let sig=hmac(Buffer.from("AWS4"+process.env.B2_APPLICATION_KEY),day);
  sig=hmac(sig,env.region);sig=hmac(sig,"s3");sig=hmac(sig,"aws4_request");
  sig=hmac(sig,string).toString("hex");
  requests++;
  const r=await fetch(env.origin.origin+path+"?"+qs,{
    headers:{"x-amz-content-sha256":empty,"x-amz-date":date,
     Authorization:"AWS4-HMAC-SHA256 Credential="+process.env.B2_KEY_ID+"/"+scope+
      ", SignedHeaders="+signedHeaders+", Signature="+sig},
    redirect:"error",signal:AbortSignal.timeout(20000)});
  if(!r.ok)fail("B2_MANIFEST_LIST_HTTP_"+r.status);
  const xml=await r.text();
  if(xml.length>250000)fail("B2_MANIFEST_LIST_TOO_LARGE");
  if(!xml.includes("<ListBucketResult"))fail("B2_MANIFEST_LIST_XML_INVALID");
  for(const match of xml.matchAll(/<Key>([^<]*)<\/Key>/g)){
   const k=decodeXml(match[1]);
   if(k.startsWith(env.prefix)&&k.endsWith(".json.gz")&&k.includes("/bundle_")){
    if(keys.has(k))fail("B2_MANIFEST_DUPLICATE_KEY");
    keys.add(k);
   }
  }
  const truncated=/<IsTruncated>true<\/IsTruncated>/.test(xml);
  if(!truncated){token=null;break}
  const next=/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/.exec(xml);
  if(!next)fail("B2_MANIFEST_NEXT_TOKEN_MISSING");
  const newToken=decodeXml(next[1]);
  if(newToken===token)fail("B2_MANIFEST_STALLED");
  token=newToken;
 }while(token!==null);
 return {keys,requests};
}
function canonical(v){
 if(v===null||typeof v==="string"||typeof v==="boolean")return JSON.stringify(v);
 if(typeof v==="number"&&Number.isFinite(v))return JSON.stringify(v);
 if(Array.isArray(v))return "["+v.map(canonical).join(",")+"]";
 if(v&&typeof v==="object"){
  if(Object.keys(v).includes("__proto__"))fail("SIGNED_JSON_FORBIDDEN_KEY");
  return "{"+Object.keys(v).sort().map(k=>JSON.stringify(k)+":"+canonical(v[k])).join(",")+"}";
 }
 fail("SIGNED_PAYLOAD_NON_JSON");
}
async function signedIndices(){
 const issuerB64=String(process.env.GEOMACRO_RISK_GATE_DECISION_ED25519_PUBLIC_KEY_SPKI_B64??"");
 const reviewerPem=String(process.env.GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_PEM??"");
 const reviewerPin=String(process.env.GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_SHA256??"");
 if(!issuerB64||!reviewerPem||!HASH.test(reviewerPin))
   fail("APPROVED_REVIEWER_OR_ISSUER_PUBLIC_PIN_MISSING");
 const issuer=createPublicKey({key:Buffer.from(issuerB64,"base64"),format:"der",type:"spki"});
 const reviewer=createPublicKey(reviewerPem);
 const reviewerDer=reviewer.export({format:"der",type:"spki"});
 if(issuer.asymmetricKeyType!=="ed25519"||reviewer.asymmetricKeyType!=="ed25519"||
    sha(reviewerDer)!==reviewerPin||
    issuer.export({format:"der",type:"spki"}).equals(reviewerDer))
   fail("REVIEWER_AUTHORITY_OR_DISTINCT_SIGNER_INVALID");
 const source=(await read(CONTROL+"/v1/public/reviewed-risk-indices")).data;
 const publicKey=(await read(CONTROL+"/v1/public/risk-gate-decision-key")).data;
 if(source.ok!==true||source.schema!=="geomacro.reviewed-indices-signed-delivery.v1"||
    source.signature_scheme!=="Ed25519"||
    source.signature_key_id!==publicKey.key_id||
    publicKey.public_key_spki_b64!==issuerB64 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(source.signature_b64??""))
   fail("REVIEWED_INDEX_DELIVERY_ENVELOPE_INVALID");
 const payload=source.signed_payload;
 if(payload?.schema!=="geomacro.reviewed-indices-issuer-delivery.v1"||
    payload.signature_proves!=="ISSUER_DELIVERY_INTEGRITY_NOT_REVIEWER_IDENTITY"||
    payload.reviewer_source!=="EXISTING_PROTECTED_GRI_V1_2_PUBLISHER")
   fail("REVIEWED_INDEX_SOURCE_PROOF_INVALID");
 const bytes=Buffer.from(canonical(payload));
 if(sha(bytes)!==source.payload_sha256||
    !verify(null,bytes,issuer,Buffer.from(source.signature_b64,"base64")))
   fail("REVIEWED_INDEX_ED25519_INVALID");
 const app=(await read("https://geomacro.live/api/public/reviewed-risk-indices")).data;
 const arr=app?.data?.indices;
 const now=Date.now();
 if(app.ok!==true||app.meta?.signature_verified!==true||
    app.meta?.signature_scheme!=="Ed25519"||
    app.meta?.public_key_trust!=="separately_pinned"||
    app.meta?.payload_sha256!==source.payload_sha256||
    app?.data?.proofHash!==payload.data?.proofHash ||
    !Array.isArray(arr)||arr.length!==3 ||
    new Set(arr.map(x=>x.key)).size!==3 ||
    !["geopolitics","macro","critical_minerals"].every(k=>arr.some(x=>
      x.key===k&&x.status==="available"&&Number.isFinite(x.score)&&
      x.score>=0&&x.score<=100&&x.readingStatus==="current"&&
      Number.isFinite(Date.parse(x.readingAsOf??""))&&
      now-Date.parse(x.readingAsOf)<=60*60000)))
   fail("THREE_CURRENT_REVIEWED_SIGNED_INDICES_UNAVAILABLE");
 return {three_domains:true,issuer_delivery_ed25519_verified:true,
   reviewer_public_authority_pinned_and_distinct:true,
   reviewed_gri_source:"EXISTING_PROTECTED_GRI_V1_2_PUBLISHER",
   payload_sha256:source.payload_sha256,
   scores:Object.fromEntries(arr.map(x=>[x.key,x.score]))};
}
const ASK_CASES=[
 ["geopolitics","Geopolitical Risk Index","What is the latest geopolitical risk index?"],
 ["macro","Macroeconomic Risk Index","What is the latest macroeconomic risk index?"],
 ["critical_minerals","Critical Minerals Risk Index","What is the latest critical minerals risk index?"]
];
async function askProof(verifiedScores){
 if(!verifiedScores)fail("ASK_REVIEWED_INDEX_REFERENCE_UNAVAILABLE");
 const rows=[];
 for(const [category,label,question] of ASK_CASES){
  const seen=[];
  for(let n=0;n<2;n++){
   const start=performance.now();
   const r=await read(ASK,{headers:{accept:"application/json",
    origin:"https://geomacro.live","x-geomacro-question":question}});
   const a=r.data?.data;
   // The current repo intentionally leaves gri:null in the exact-index
   // answer: it returns a fresh signed text reading without caching a score.
   if(r.data?.ok!==true||!a||typeof a.summary!=="string"||
      a.summary.indexOf(label+": "+verifiedScores[category]+"/100")<0||
      a.real_time_message!=="CURRENT_SIGNED_REVIEWED_RISK_INDEX"||
      !Array.isArray(a.evidence)||a.insufficient_evidence!==false||
      a.low_confidence!==false||a.cache_status!=="bypassed"||
      a.gri!==null||a.source_identity_exposed!==false||
      a.durable_live_storage_write!==false)
    fail("ASK_SIGNED_INDEX_CONTEXT_OR_NO_CACHE_INVARIANT_"+category);
   seen.push({cache_status:a.cache_status,latency_ms:Math.round(performance.now()-start)});
  }
  rows.push({category,verified_index_score:verifiedScores[category],requests:seen});
 }
 // A separate ordinary, non-index explainer checks cache contract without
 // falsely expecting signed index answers to be shared or model-rewritten.
 const general=[];
 for(let n=0;n<2;n++){
  const t=performance.now();
  const r=await read(ASK,{headers:{accept:"application/json",
    origin:"https://geomacro.live",
    "x-geomacro-question":"How does monetary policy influence foreign exchange rates?"}});
  const data=r.data?.data;
  if(r.data?.ok!==true||!data||typeof data.summary!=="string"||
     typeof data.cache_status!=="string"||
     data.source_identity_exposed!==false||data.durable_live_storage_write!==false)
   fail("ASK_SHARED_ANSWER_CACHE_CONTRACT_UNAVAILABLE");
  general.push({cache_status:data.cache_status,
    model_render_cache:data.model_render_cache??null,
    model_render_cache_scope:data.model_render_cache_scope??null,
    latency_ms:Math.round(performance.now()-t)});
 }
 return {index_domains:rows,ordinary_answer_cache_reads:general,
   observed_cache_hit:general.some(x=>x.cache_status==="hit"||x.model_render_cache==="hit"),
   zero_latency_claim:false,groq_architecture_unchanged:true};
}
if(process.argv[1] && fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 const allowed=new Set(["--redrive","--b2-list"]);
 try{
  if(process.argv.slice(2).some(x=>!allowed.has(x)))fail("UNKNOWN_ARGUMENT");
  if(process.argv.includes("--redrive")){
   const value=await redrive();record("FIFO_REDRIVE_SINGLE_BOUNDED_CALL",value.ok,value);
  }
  let c=null;
  try{
   c=await census();
   const b=c.backlog;
   const ready=b.zero_unhandled_proven===true&&zero(b.total_unhandled)&&
     zero(b.provider_queue_backlog)&&zero(b.exact_bundle_journal_mismatch);
   record("Backlog Census",ready,{pending:b.total_unhandled,provider:b.provider_queue_backlog,
     historical_raw:b.historical_raw});
  }catch(e){record("Backlog Census",false,{reason:String(e.message).slice(0,120)})}
  if(c){
   const coverage=c.coverage;
   record("Hot 50 Coverage",coverage.cells?.length===150&&
     coverage.original_dated_cells===150&&
     coverage.multi_publisher_cells===150&&coverage.qualified_certified_cells===150,
     {observed:coverage.observed_cells,empty:coverage.empty_cells,
      native:coverage.original_dated_cells,multi:coverage.multi_publisher_cells,
      certified:coverage.qualified_certified_cells});
   try{
    const check=await verifyArchivePages(c.backlog.archived_outboxes);
    let physicalList=false,details=check;
    if(process.argv.includes("--b2-list")){
     const refs=await manifestRefs(c.backlog.archived_outboxes);
     const listed=await listB2();
     const listedUris=new Set([...listed.keys].map(k=>"b2://"+k));
     const missing=[...refs].filter(x=>!listedUris.has(x));
     const orphan=[...listedUris].filter(x=>!refs.has(x));
     physicalList=missing.length===0&&orphan.length===0;
     details={...check,manifest_list_requests:listed.requests,
      missing_objects:missing.length,unreferenced_objects:orphan.length};
    }
    record("B2-D1 Parity",physicalList,details);
   }catch(e){record("B2-D1 Parity",false,{reason:String(e.message).slice(0,150)})}
  }else record("B2-D1 Parity",false,{reason:"CENSUS_NOT_AVAILABLE"});
  let signedScores=null;
  try{const proof=await signedIndices();signedScores=proof.scores;
    record("Index Signing",true,proof)}
  catch(e){record("Index Signing",false,{reason:String(e.message).slice(0,150)})}
  try{record("Ask GeoMacro Retrieval",true,await askProof(signedScores))}
  catch(e){record("Ask GeoMacro Retrieval",false,{reason:String(e.message).slice(0,150)})}
  const pass=results.every(r=>r.status==="PASS");
  console.log(JSON.stringify({schema:"geomacro.hot50-production-activation-acceptance.v1",
   checked_at:new Date().toISOString(),ok:pass,scope:"HOT50_X_3",
   results},null,2));
  if(!pass)process.exitCode=2;
 }catch(e){
  console.log(JSON.stringify({ok:false,error:String(e.message).slice(0,180),
   no_success_claim:true}));
  process.exitCode=2;
 }
}
