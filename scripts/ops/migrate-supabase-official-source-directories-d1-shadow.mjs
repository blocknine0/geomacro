#!/usr/bin/env node
/**
 * One-time owner-authorized, READ-ONLY Supabase -> PRIVATE D1 shadow.
 * Never publishes/activates official source URLs or raw data for customers.
 * Only four official-source directory tables. No SQL delete, no x402 and
 * no storage/B2 operations. No sensitive row, SQL payload, URL or token logs.
 */
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";

export const DATASETS=Object.freeze(["primary","statistics","monetary","critical_minerals"]);
const AUTHORITATIVE_PROJECT="ldpwajisioljyjtojvfx";
const CHECKED_COUNTS={primary:195,statistics:194,monetary:195,critical_minerals:195};
const SCRIPT_ERROR="LEGACY_SOURCE_DIRECTORY_SHADOW_RECONCILIATION_FAILED";
const D1="geomacro-control-plane";
const SAFE=/^[A-Z]{2}$/u;
const SHA=/^[a-f0-9]{64}$/u;
const COUNTRY_COUNT=195;
const encoder=new TextEncoder();
let stage="PRECHECK";
function invalid(){throw Error(SCRIPT_ERROR+"_"+stage)}
const sha256=s=>createHash("sha256").update(s,"utf8").digest("hex");
function stable(v){
 if(v===null||typeof v!=="object")return JSON.stringify(v);
 if(Array.isArray(v))return "["+v.map(stable).join(",")+"]";
 return "{"+Object.keys(v).sort().map(k=>JSON.stringify(k)+":"+stable(v[k])).join(",")+"}";
}
function object(v){return v&&typeof v==="object"&&!Array.isArray(v)}
export function validateSupabaseDirectoryRows(lines){
 if(!Array.isArray(lines)||lines.length>COUNTRY_COUNT*4+4)invalid();
 const families=Object.fromEntries(DATASETS.map(d=>[d,new Map()]));
 const isoSets=Object.fromEntries(DATASETS.map(d=>[d,new Set()]));
 for(const line of lines){
  if(typeof line!=="string"||line.length>16000)invalid();
  let candidate;try{candidate=JSON.parse(line)}catch{invalid();}
  if(!object(candidate)||!DATASETS.includes(candidate.dataset)||
     !SAFE.test(candidate.iso2)||!object(candidate.row)||
     candidate.row.country_iso2!==candidate.iso2)invalid();
  // This table is private but may still contain original links/notes.
  // Reject credential-shaped columns; never serialize secrets to another DB.
  if(Object.keys(candidate.row).some(k=>/(?:password|secret|private_key|api_key|token)/iu.test(k)))
    invalid();
  const family=families[candidate.dataset];
  if(family.has(candidate.iso2))invalid();
  const row=stable(candidate.row);
  if(encoder.encode(row).byteLength>12_000)invalid();
  family.set(candidate.iso2,{
    dataset:candidate.dataset,iso2:candidate.iso2,json:row,hash:sha256(row),
    verification:typeof candidate.row.verification_state==="string"
      ?candidate.row.verification_state.slice(0,96):
      typeof candidate.row.source_discovery_state==="string"
      ?candidate.row.source_discovery_state.slice(0,96):"UNCLASSIFIED",
  });
  isoSets[candidate.dataset].add(candidate.iso2);
 }
 for(const category of DATASETS){
  const count=families[category].size;
  if(category==="statistics"){
    if(![194,195].includes(count))invalid();
  }else if(count!==195)invalid();
 }
 const basis=isoSets.primary;
 for(const category of DATASETS){
   if([...isoSets[category]].some(code=>!basis.has(code)))invalid();
 }
 const missingStatistics=[...basis].filter(code=>!isoSets.statistics.has(code)).sort();
 if(missingStatistics.length>1)invalid();
 // Preserve any real future VA source if eventually discovered and reviewed.
 if(missingStatistics.length===1&&missingStatistics[0]!=="VA")invalid();
 const rows=DATASETS.flatMap(d=>[...families[d].values()].sort((a,b)=>a.iso2.localeCompare(b.iso2)));
 return {
  rows,
  counts:Object.fromEntries(DATASETS.map(d=>[d,families[d].size])),
  missing_statistics_iso2:missingStatistics,
  manifest_sha256:sha256(rows.map(r=>r.dataset+":"+r.iso2+":"+r.hash).join("\n")),
  sources_activated:false,
 };
}
function validateDbUri(uri){
 try{
  const u=new URL(uri);
  if(!["postgres:","postgresql:"].includes(u.protocol)||
    u.password.length<1||u.pathname!=="/postgres")invalid();
  const direct=u.hostname==="db."+AUTHORITATIVE_PROJECT+".supabase.co"&&u.username==="postgres";
  const pool=u.hostname.endsWith(".pooler.supabase.com")&&u.username==="postgres."+AUTHORITATIVE_PROJECT;
  if(!direct&&!pool)invalid();
 }catch{invalid()}
}
async function supabaseSnapshot(){
 stage="SUPABASE_URI_VALIDATION";
 const uri=String(process.env.SUPABASE_DB_URL??"");
 validateDbUri(uri);
 const specs={
   primary:"live_country_primary_source_directory",
   statistics:"live_country_statistics_source_directory",
   monetary:"live_country_monetary_authority_directory",
   critical_minerals:"live_country_critical_mineral_source_directory"
 };
 const selects=Object.entries(specs).map(([name,table])=>
  "SELECT jsonb_build_object('dataset','"+name+"','iso2',country_iso2,'row',to_jsonb(t))::text FROM public."+table+" t");
 const sql="BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;\n"+
   selects.join("\nUNION ALL\n")+"\nORDER BY 1;\nCOMMIT;\n";
 // PGDATABASE carries the URI via protected process environment, not argv.
 stage="SUPABASE_READ_ONLY_PSQL";
 const r=spawnSync("psql",["-X","-A","-t","-v","ON_ERROR_STOP=1","-f","-"],{
  input:sql,encoding:"utf8",maxBuffer:8*1024*1024,timeout:60000,
  env:{...process.env,PGDATABASE:uri,PGCONNECT_TIMEOUT:"12",PGSSLMODE:"verify-full"},
 });
 if(!r.error&&r.status===0&&typeof r.stdout==="string"){
   stage="SUPABASE_ROW_VALIDATION";
   return {...validateSupabaseDirectoryRows(
     r.stdout.split(/\r?\n/u).filter(l=>l.trim()&&l!=="BEGIN"&&l!=="COMMIT")
   ),read_transport:"POSTGRES_READ_ONLY_SNAPSHOT"};
 }
 // Some protected GitHub runners have PostgreSQL-pooler TLS or network
 // incompatibilities. Fall back ONLY to the exact pinned project's HTTPS
 // read-only PostgREST service-key API. Never send DSN or key to Cloudflare.
 // Two identical complete reads reject concurrent source-directory changes.
 stage="SUPABASE_REST_SERVICE_AUTH";
 const service=String(process.env.SUPABASE_SERVICE_ROLE_KEY||
   process.env.APP_SUPABASE_SERVICE_ROLE_KEY||"");
 if(service.length<40)invalid();
 const api="https://"+AUTHORITATIVE_PROJECT+".supabase.co/rest/v1/";
 async function restReadOnce(){
   const result=[];
   for(const [dataset,table] of Object.entries(specs)){
     stage="SUPABASE_REST_READ_"+dataset.toUpperCase();
     const url=api+table+"?select=*";
     const response=await fetch(url,{
       method:"GET",redirect:"error",cache:"no-store",
       headers:{"apikey":service,"authorization":"Bearer "+service,
         "accept":"application/json","range-unit":"items","range":"0-194"},
       signal:AbortSignal.timeout(15000),
     }).catch(()=>null);
     if(!response||!response.ok||
        !/^application\/json/u.test(response.headers.get("content-type")??""))
       invalid();
     if(Number(response.headers.get("content-length")??0)>1_000_000)invalid();
     const reader=response.body?.getReader();
     if(!reader)invalid();
     let chunks=[],len=0;
     for(;;){
       const v=await reader.read();
       if(v.done)break;
       len+=v.value.byteLength;
       if(len>1_000_000){await reader.cancel().catch(()=>{});invalid();}
       chunks.push(v.value);
     }
     let bytes=new Uint8Array(len),offset=0;
     for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}
     const text=new TextDecoder("utf-8",{fatal:true}).decode(bytes);
     let rows;try{rows=JSON.parse(text)}catch{invalid()}
     if(!Array.isArray(rows)||rows.length>195)invalid();
     for(const row of rows){
       if(!object(row)||typeof row.country_iso2!=="string")invalid();
       result.push(JSON.stringify({dataset,iso2:row.country_iso2,row}));
     }
   }
   stage="SUPABASE_REST_ROW_VALIDATION";
   return validateSupabaseDirectoryRows(result);
 }
 const first=await restReadOnce();
 const second=await restReadOnce();
 stage="SUPABASE_REST_DOUBLE_READ_HASH";
 if(first.manifest_sha256!==second.manifest_sha256||
    JSON.stringify(first.counts)!==JSON.stringify(second.counts))invalid();
 return {...second,read_transport:"POSTGREST_TWO_PASS_READ_ONLY"};
}
async function cloudflare(path,token,body){
 const response=await fetch("https://api.cloudflare.com/client/v4"+path,{
  method:body?"POST":"GET",redirect:"error",
  headers:{"authorization":"Bearer "+token,"accept":"application/json",
    ...(body?{"content-type":"application/json"}:{})},
  body:body?JSON.stringify(body):undefined,
  signal:AbortSignal.timeout(30000),
 });
 const result=await response.json().catch(()=>null);
 if(!response.ok||result?.success!==true)invalid();
 return result;
}
async function d1Query(account,id,token,batch){
 if(batch.length>30||encoder.encode(JSON.stringify({batch})).byteLength>1_000_000)invalid();
 const doc=await cloudflare("/accounts/"+account+"/d1/database/"+id+"/query",
  token,{batch});
 if(!Array.isArray(doc.result)||doc.result.length!==batch.length||
    doc.result.some(r=>r?.success!==true))invalid();
 return doc.result.map(r=>r.results??[]);
}
export async function migrateShadow(){
 stage="OWNER_ACK";
 if(process.env.GEOMACRO_SOURCE_DIRECTORY_SHADOW_ACK!=="YES")invalid();
 // No fallback to writing a public source registry.
 stage="CLOUDFLARE_SECRET_VALIDATION";
 const account=String(process.env.CLOUDFLARE_ACCOUNT_ID??"");
 const token=String(process.env.CLOUDFLARE_API_TOKEN??"");
 if(!/^[a-f0-9]{32}$/u.test(account)||token.length<20)invalid();
 const snapshot=await supabaseSnapshot();
 stage="CLOUDFLARE_D1_DISCOVERY";
 const list=await cloudflare("/accounts/"+account+"/d1/database?per_page=100",token);
 const matches=(list.result??[]).filter(x=>x.name===D1);
 if(matches.length!==1||!matches[0].uuid)invalid();
 const id=matches[0].uuid;
 const stamp=new Date().toISOString();
 // Only insert/update private mirror rows; NEVER write live source registry.
 const sql="INSERT INTO legacy_official_source_directory_shadow (dataset,country_iso2,source_row_json,source_row_sha256,verification_state,copied_at) VALUES (?,?,?,?,?,?) ON CONFLICT(dataset,country_iso2) DO UPDATE SET source_row_json=excluded.source_row_json,source_row_sha256=excluded.source_row_sha256,verification_state=excluded.verification_state,copied_at=excluded.copied_at";
 stage="CLOUDFLARE_D1_WRITES";
 for(let i=0;i<snapshot.rows.length;i+=24){
  const batch=snapshot.rows.slice(i,i+24).map(r=>({
   sql,params:[r.dataset,r.iso2,r.json,r.hash,r.verification,stamp],
  }));
  await d1Query(account,id,token,batch);
 }
 stage="CLOUDFLARE_D1_READBACK";
 const observed=[];
 for(const family of DATASETS){
  const rows=await d1Query(account,id,token,[{
   sql:"SELECT dataset,country_iso2,source_row_json,source_row_sha256 FROM legacy_official_source_directory_shadow WHERE dataset=? ORDER BY country_iso2",
   params:[family],
  }]);
  if(!Array.isArray(rows[0]))invalid();
  for(const row of rows[0]){
   if(!DATASETS.includes(row.dataset)||!SAFE.test(row.country_iso2)||
      !SHA.test(row.source_row_sha256)||
      sha256(row.source_row_json)!==row.source_row_sha256)invalid();
   observed.push({dataset:row.dataset,iso2:row.country_iso2,
     json:row.source_row_json,hash:row.source_row_sha256});
  }
 }
 const expected=new Map(snapshot.rows.map(r=>[r.dataset+":"+r.iso2,r]));
 if(observed.length!==snapshot.rows.length)invalid();
 for(const entry of observed){
  const original=expected.get(entry.dataset+":"+entry.iso2);
  if(!original||original.hash!==entry.hash||original.json!==entry.json)invalid();
 }
 stage="FINAL_MANIFEST_HASH";
 const digest=sha256(observed.map(r=>r.dataset+":"+r.iso2+":"+r.hash).join("\n"));
 if(digest!==snapshot.manifest_sha256)invalid();
 return {
  ok:true,schema:"geomacro.legacy-source-directory-d1-shadow-acceptance.v1",
  counts:snapshot.counts,missing_statistics_iso2:snapshot.missing_statistics_iso2,
  source_read_transport:snapshot.read_transport,
  manifest_sha256:digest,strict_supabase_read_only:true,
  d1_exact_hash_and_cardinality_readback:true,
  source_activation_performed:false,partner_delivery_changed:false,
  paid_product_promoted:false,b2_operations:0,payments:0,
  supabase_row_deletions:0,
 };
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 migrateShadow().then(r=>console.log(JSON.stringify(r)))
  .catch(error=>{
   const code=String(error?.message??"");
   // Only hardcoded phase names; NEVER log Postgres, HTTP or credentials.
   console.error(code.startsWith(SCRIPT_ERROR+"_")?code:SCRIPT_ERROR+"_UNEXPECTED");
   process.exitCode=2;
  });
}
