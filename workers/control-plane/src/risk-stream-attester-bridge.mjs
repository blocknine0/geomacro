const MAX_BODY=32*1024;
const TOKEN=/^[A-Za-z0-9+/_=-]{32,256}$/u;
const BASE64=/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;
const fail=code=>{throw Error(code)};
function exact(value,keys){return value&&typeof value==="object"&&!Array.isArray(value)&&
 Object.keys(value).sort().join("|")===keys.slice().sort().join("|")}
async function readBounded(request){
 const declared=request.headers.get("content-length");
 if(declared!==null&&(!/^\d+$/u.test(declared)||Number(declared)>MAX_BODY))
  fail("ATTESTATION_REQUEST_TOO_LARGE");
 const reader=request.body?.getReader();if(!reader)fail("ATTESTATION_REQUEST_INVALID");
 const chunks=[];let size=0;
 try{
  while(true){
   const {done,value}=await reader.read();if(done)break;
   size+=value.byteLength;if(size>MAX_BODY){await reader.cancel();fail("ATTESTATION_REQUEST_TOO_LARGE")}
   chunks.push(value);
  }
 }finally{reader.releaseLock()}
 const bytes=new Uint8Array(size);let offset=0;
 for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}
 try{return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes))}
 catch{fail("ATTESTATION_REQUEST_INVALID")}
}
function validSignature(value){
 if(typeof value!=="string"||!BASE64.test(value))return false;
 try{
  const decoded=atob(value);
  if(decoded.length!==64)return false;
  let binary="";for(let i=0;i<decoded.length;i++)binary+=String.fromCharCode(decoded.charCodeAt(i));
  return btoa(binary)===value;
 }catch{return false}
}
async function requestAttestation(binding,bearer,candidate){
 if(!binding?.fetch||typeof bearer!=="string"||!TOKEN.test(bearer))
  fail("ATTESTER_BINDING_OR_AUTH_UNAVAILABLE");
 let response;
 try{
  response=await binding.fetch(new Request("https://risk-stream-attester.internal/v1/attest",{
   method:"POST",headers:{Authorization:"Bearer "+bearer,"Content-Type":"application/json"},
   body:JSON.stringify(candidate)}));
 }catch{fail("ATTESTER_UNAVAILABLE")}
 if(!response?.ok)fail("ATTESTER_REFUSED");
 let body;try{body=await response.json()}catch{fail("ATTESTER_RESPONSE_INVALID")}
 const fields=Object.keys(body?.proof??{});
 if(body?.ok!==true||fields.length!==1||
    !["facts_signature_b64","rights_signature_b64"].includes(fields[0])||
    !validSignature(body.proof[fields[0]]))fail("ATTESTER_RESPONSE_INVALID");
 return body.proof;
}

/** Root-admin protected control-plane bridge to two private service-bound Workers. */
export async function attestRiskStreamOriginal(request,env){
 if(request.method!=="POST")return Response.json({ok:false,error:"METHOD_NOT_ALLOWED"},{status:405});
 let packet;
 try{packet=await readBounded(request)}
 catch(error){
  const code=String(error?.message??"ATTESTATION_REQUEST_INVALID");
  return Response.json({ok:false,error:code},{status:code==="ATTESTATION_REQUEST_TOO_LARGE"?413:400});
 }
 if(!exact(packet,["schema","draft"])||packet.schema!=="geomacro.risk-stream-attestation-request.v1"||
    !packet.draft||packet.draft.schema!=="geomacro.risk-stream-candidate.v1"||
    packet.draft.kind!=="VERIFIED_ORIGINAL"||packet.draft.proof!==null)
  return Response.json({ok:false,error:"ATTESTATION_REQUEST_INVALID"},{status:400});
 try{
  const [facts,rights]=await Promise.all([
   requestAttestation(env.RISK_STREAM_FACTS_ATTESTER,env.RISK_STREAM_FACTS_ATTESTER_BEARER_TOKEN,packet.draft),
   requestAttestation(env.RISK_STREAM_RIGHTS_ATTESTER,env.RISK_STREAM_RIGHTS_ATTESTER_BEARER_TOKEN,packet.draft)
  ]);
  return Response.json({ok:true,proof:{...facts,...rights}},
   {headers:{"Cache-Control":"no-store"}});
 }catch(error){
  const code=String(error?.message??"");
  const status=code==="ATTESTER_BINDING_OR_AUTH_UNAVAILABLE"?503:
   code==="ATTESTER_RESPONSE_INVALID"?502:503;
  return Response.json({ok:false,error:code||"ATTESTER_UNAVAILABLE"},{status});
 }
}
