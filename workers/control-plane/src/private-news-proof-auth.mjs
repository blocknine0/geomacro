/**
 * Internal-only news verification capability. This is NEVER a public
 * source/qualification/issuer proof API, and grants no database writes,
 * PREDGE research access, money movement, or signing authority.
 *
 * Separate derived scope from the admin token and from the low-review token.
 * No new credential, storage, source fetch, clock or ingestion job.
 */
const DOMAIN_LOW_REVIEW="geomacro-low-source-review-v1";
const DOMAIN_NEWS_PROOF="geomacro-internal-news-proof-read-v1";
const HEX=/^[a-f0-9]{64}$/;
const encode=s=>new TextEncoder().encode(s);
async function hmac(key,message){
 const cryptoKey=await crypto.subtle.importKey("raw",encode(key),
   {name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const bytes=new Uint8Array(await crypto.subtle.sign("HMAC",cryptoKey,encode(message)));
 return Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");
}
function equalHex(a,b){
 if(!HEX.test(a??"")||!HEX.test(b??""))return false;
 const x=encode(a),y=encode(b);
 let diff=0;
 for(let i=0;i<x.length;i++)diff|=x[i]^y[i];
 return diff===0;
}
export async function authorizePrivateNewsProof(request,env){
 const control=String(env?.CONTROL_PLANE_TOKEN??"").trim();
 if(!HEX.test(control))return {ok:false,status:503,error:"PRIVATE_NEWS_PROOF_UNAVAILABLE"};
 const header=request.headers.get("authorization")??"";
 const match=/^Bearer ([a-f0-9]{64})$/.exec(header);
 if(!match)return {ok:false,status:404,error:"NOT_FOUND"};
 const low=await hmac(control,DOMAIN_LOW_REVIEW);
 const expected=await hmac(low,DOMAIN_NEWS_PROOF);
 return equalHex(match[1],expected)
  ?{ok:true}:{ok:false,status:404,error:"NOT_FOUND"};
}
