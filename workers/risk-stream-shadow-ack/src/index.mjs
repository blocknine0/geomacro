/** No customer routes, no storage, no payment. Shadow-only HTTPS ACK. */
const enc=new TextEncoder();
async function digest(text){
 return new Uint8Array(await crypto.subtle.digest("SHA-256",enc.encode(text)));
}
async function authorized(supplied,expected){
 if(typeof expected!=="string"||expected.length<32||
    typeof supplied!=="string"||supplied.length!==expected.length)
  return false;
 const [a,b]=await Promise.all([digest(supplied),digest(expected)]);
 let v=0;for(let i=0;i<a.length;i++)v|=a[i]^b[i];
 return v===0;
}
const json=(body,status=200)=>Response.json(body,{
 status,headers:{"Cache-Control":"no-store","Content-Type":"application/json"}
});
export default {
 async fetch(request,env){
  const url=new URL(request.url);
  if(url.pathname==="/healthz"&&request.method==="GET")
   return json({ok:true,service:"SHADOW_COMMERCIAL_ACK_ONLY"});
  if(url.pathname!=="/v1/internal/mock-commercial-ack"||
     request.method!=="POST"||url.search)
   return json({ok:false,error:"NOT_FOUND"},404);
  if(!await authorized(request.headers.get("X-GeoMacro-Shadow-ACK"),
    env.STREAM_SHADOW_ACK_TOKEN))
   return json({ok:false,error:"UNAUTHORIZED"},401);
  const id=request.headers.get("X-GeoMacro-Delivery-ID");
  if(!/^[a-f0-9]{64}$/u.test(id??"")||
     request.headers.get("Idempotency-Key")!==id||
     request.headers.get("X-GeoMacro-License-ID")!==
      "GEOMACRO_COMMERCIAL_REDISTRIBUTION_v1")
   return json({ok:false,error:"INVALID_TEST_DELIVERY_IDENTITY"},400);
  const raw=await request.text();
  if(raw.length>24000)return json({ok:false,error:"TOO_LARGE"},413);
  let payload;try{payload=JSON.parse(raw)}catch{
   return json({ok:false,error:"INVALID_JSON"},400)
  }
  const hash=payload?.license_proof?.payload_sha256;
  if(payload?.payload?.license_id!=="GEOMACRO_COMMERCIAL_REDISTRIBUTION_v1"||
     !/^[a-f0-9]{64}$/u.test(hash??"")||
     payload?.payload?.charged!==false||
     payload?.payload?.execution_authorized!==false)
   return json({ok:false,error:"NON_TEST_LICENSE_INVALID"},400);
  // Non-customer echo is intentionally stateless. The sending shadow D1
  // stores the immutable matching receipt and idempotency key.
  return json({schema:"geomacro.commercial-webhook-ack.v1",
    job_id:id,payload_sha256:hash,status:"ACCEPTED"});
 }
};
