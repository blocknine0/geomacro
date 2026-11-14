/**
 * Read-only, same-origin-as-browser CORS acceptance for the immutable public
 * Website Intelligence archive. A green Worker deploy without CORS and exact
 * category shard bytes does not prove the browser can render OSINT findings.
 * No source, D1, B2, payment, signing or partner calls.
 */
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";

const ORIGIN="https://geomacro.live";
const BASE="https://geomacro-public-finds-archive.daspallab202391.workers.dev";
const CATEGORIES=["geopolitics","macro","rare_earth"];
const SHA=x=>createHash("sha256").update(x).digest("hex");
const safeMonth=/^20[0-9]{2}-(?:0[1-9]|1[0-2])$/u;
const fail=code=>{throw Error("PUBLIC_ARCHIVE_BROWSER_CORS_"+code)};
export async function verifyPublicArchiveBrowserCors({
 index,assetRoot="workers/public-finds-archive/assets",
 fetchImpl=fetch,loadFile=readFileSync,base=BASE,origin=ORIGIN,
 attempts=3,pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),
}={}){
 if(index?.schema!=="geomacro.permanent-derived-news-archive-index.v1"||
    index.seed_complete!==true||!Array.isArray(index.months)||
    index.months.length<1||!safeMonth.test(index.months[0])||
    !Array.isArray(index.categories)||index.categories.length!==3||
    CATEGORIES.some(c=>!index.categories.includes(c))||
    !Number.isSafeInteger(attempts)||attempts<1||attempts>5||
    base!==BASE||origin!==ORIGIN||typeof loadFile!=="function"||
    typeof fetchImpl!=="function")fail("INPUT_INVALID");
 const month=index.months[0];
 const paths=["/index.json",...CATEGORIES.map(c=>"/archive/"+month+"/"+c+".json")];
 let lastCode="READBACK_UNAVAILABLE";
 for(let attempt=0;attempt<attempts;attempt++){
  try{
   let verified=0;
   for(const path of paths){
    const expected=loadFile(assetRoot+path,"utf8");
    if(typeof expected!=="string"||expected.length>2_000_000||expected.length===0)
     fail("LOCAL_ASSET_MISSING_OR_OVERSIZE");
    const response=await fetchImpl(base+path+"?browser_origin_verify="+attempt,{
     method:"GET",redirect:"error",headers:{Origin:origin,Accept:"application/json",
      "Cache-Control":"no-cache"},signal:AbortSignal.timeout(12000),
    });
    if(!response||response.status!==200||response.redirected)
     fail("HTTP_UNAVAILABLE");
    if(response.headers.get("Access-Control-Allow-Origin")!=="*"||
       response.headers.get("Access-Control-Allow-Credentials")==="true")
     fail("CORS_MISSING_OR_CREDENTIALLED");
    const actual=await response.text();
    if(actual.length>2_000_000||SHA(expected)!==SHA(actual))
     fail("IMMUTABLE_BYTES_MISMATCH");
    verified++;
   }
   return Object.freeze({
    schema:"geomacro.website-intelligence-browser-archive-cors-proof.v1",
    ok:true,month,website_origin:origin,shards_verified:CATEGORIES.length,
    archive_index_verified:true,exact_immutable_bytes_verified:true,
    browser_cors_verified:true,checked_asset_count:verified,
    d1_reads:0,d1_writes:0,b2_requests:0,source_fetches:0,
    paid_calls:0,predge_modified:false,payments:0,
   });
  }catch(error){
   // Avoid logging response bodies and private data. Retry only the bounded
   // known asset set; a missing shard is never turned into a false pass.
   const message=String(error?.message??"");
   lastCode=message.startsWith("PUBLIC_ARCHIVE_BROWSER_CORS_")?
    message.slice("PUBLIC_ARCHIVE_BROWSER_CORS_".length):"TRANSPORT_OR_PARSE";
   if(attempt+1<attempts)await pause(900);
  }
 }
 fail(lastCode);
}
