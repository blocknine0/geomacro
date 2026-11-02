// Restricted read-only Backblaze B2 GRO reader for isolated Cloudflare Worker.
// Signs S3 GET with dedicated application key scoped to geomacro-evidence/v1/live/country-gro/.
// Does not list buckets or write B2. Does not accept URL overrides.
const ENDPOINT="https://s3.us-east-005.backblazeb2.com";
const BUCKET="geomacro-private-archive";
const PREFIX="geomacro-evidence/v1/live/country-gro/";
const SOURCE_PROJECT="ldpwajisioljyjtojvfx"; // Provenance of existing canonical B2 GRO.
const encoder=new TextEncoder();
const decoder=new TextDecoder("utf-8",{fatal:true});
const hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("");
async function sha(bytes){return hex(await crypto.subtle.digest("SHA-256",bytes));}
async function hmac(key,value){
  const raw=typeof key==="string"?encoder.encode(key):key;
  const k=await crypto.subtle.importKey("raw",raw,{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC",k,encoder.encode(value)));
}
async function limitedBytes(response,cap){
  if(response.headers.get("content-length")&&Number(response.headers.get("content-length"))>cap)
    throw Error("B2_RESPONSE_TOO_LARGE");
  const reader=response.body?.getReader();
  if(!reader)throw Error("B2_BODY_MISSING");
  const chunks=[];let total=0;
  try{
    for(;;){const {done,value}=await reader.read();if(done)break;
      total+=value.byteLength;if(total>cap)throw Error("B2_RESPONSE_TOO_LARGE");
      chunks.push(value);
    }
  }catch(e){await reader.cancel().catch(()=>{});throw e;}
  const all=new Uint8Array(total);let pos=0;
  for(const b of chunks){all.set(b,pos);pos+=b.length;}
  return all;
}
export async function readCountryGroB2(iso3,{keyId,applicationKey,fetchImpl=fetch}={}){
  if(!/^[A-Z]{3}$/.test(iso3))throw Error("B2_COUNTRY_INVALID");
  if(typeof keyId!=="string"||keyId.length<8||typeof applicationKey!=="string"||applicationKey.length<20)
    throw Error("B2_READONLY_CREDENTIAL_MISSING");
  const objectKey=PREFIX+iso3+"/latest.json.gz";
  const path="/"+[BUCKET,...objectKey.split("/")].map(encodeURIComponent).join("/");
  const host="s3.us-east-005.backblazeb2.com";
  const timestamp=new Date().toISOString().replace(/[:-]|\.\d{3}/g,"");
  const day=timestamp.slice(0,8);
  const bodyHash=await sha(encoder.encode(""));
  const signedHeaders="host;x-amz-content-sha256;x-amz-date";
  const canonicalHeaders="host:"+host+"\n"+"x-amz-content-sha256:"+bodyHash+"\n"+"x-amz-date:"+timestamp+"\n";
  const canonical=["GET",path,"",canonicalHeaders,signedHeaders,bodyHash].join("\n");
  const scope=day+"/us-east-005/s3/aws4_request";
  const signable=["AWS4-HMAC-SHA256",timestamp,scope,await sha(encoder.encode(canonical))].join("\n");
  const signingKey=await hmac(await hmac(await hmac(await hmac("AWS4"+applicationKey,day),"us-east-005"),"s3"),"aws4_request");
  const signature=hex(await hmac(signingKey,signable));
  const url=ENDPOINT+path;
  const response=await fetchImpl(url,{method:"GET",headers:{
    "x-amz-content-sha256":bodyHash,
    "x-amz-date":timestamp,
    authorization:"AWS4-HMAC-SHA256 Credential="+keyId+"/"+scope+", SignedHeaders="+signedHeaders+", Signature="+signature
  },redirect:"error",signal:AbortSignal.timeout(6000)});
  if(response.status===404)return null; // Genuine no-country-object, no data invented.
  if(!response.ok)throw Error("B2_READ_HTTP_"+response.status);
  const compressed=await limitedBytes(response,2_000_000);
  if(!compressed.length)throw Error("B2_OBJECT_EMPTY");
  let raw;
  try{
    const stream=new Blob([compressed]).stream().pipeThrough(new DecompressionStream("gzip"));
    raw=await limitedBytes(new Response(stream),4_000_000);
  }catch{throw Error("B2_GRO_GZIP_INVALID");}
  let body;
  try{body=JSON.parse(decoder.decode(raw));}catch{throw Error("B2_GRO_JSON_INVALID");}
  if(body?.schema!=="geomacro.country-gro-continuity.v1"||
     body.source_project!==SOURCE_PROJECT||body.country_iso3!==iso3||
     body.object?.subject?.type!=="country"||body.object.subject.id!==iso3)
    throw Error("B2_GRO_ENVELOPE_INVALID");
  return body.object; // NEVER use without independent pinned Ed25519 verification.
}
