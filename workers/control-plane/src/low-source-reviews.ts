import {verifyLowSourceReview,type SignedLowSourceReview,type LowReviewTrust} from '../../../src/lib/low-authority-source-review.ts';
const PREFIX='low_source_review_v1:';
const reply=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
export async function lowReviewToken(controlToken:string){
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(controlToken),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode('geomacro-low-source-review-v1'))),b=>b.toString(16).padStart(2,'0')).join('');
}
export async function handleLowSourceReviews(request:Request,env:any,now=Date.now()){
 const root=String(env.CONTROL_PLANE_TOKEN??'').trim();
 if(root.length<32)return reply({ok:false,error:'INTERNAL_REVIEW_UNAVAILABLE'},503);
 const expected='Bearer '+await lowReviewToken(root),actual=request.headers.get('authorization')??'';
 let diff=expected.length^actual.length;
 for(let i=0;i<expected.length;i++)diff|=expected.charCodeAt(i)^(actual.charCodeAt(i)||0);
 if(diff!==0)return reply({ok:false,error:'UNAUTHORIZED'},401);
 try{
  if(request.method!=='PUT'||new URL(request.url).search)return reply({ok:false,error:'METHOD_NOT_ALLOWED'},405);
  const registry=JSON.parse(env.AUTOMATED_FINDS_VERIFY_KEYS_JSON??'{}');
  const trust:LowReviewTrust={public_spki_b64:env.GEOMACRO_LOW_REVIEW_PUBLIC_SPKI_B64,
   public_sha256:env.GEOMACRO_LOW_REVIEW_PUBLIC_SHA256,
   issuer_public_keys_b64:Object.values(registry).map((v:any)=>typeof v==='string'?v:v.public_key_spki_b64)};
  const text=await request.text();if(new TextEncoder().encode(text).byteLength>150000)throw Error('SIZE');
  const body=JSON.parse(text);
  if(!body||Object.keys(body).join(',')!=='items'||!Array.isArray(body.items)||body.items.length<1||body.items.length>40)throw Error('SHAPE');
  for(const e of body.items)await verifyLowSourceReview(e,trust,now);
  const statements=body.items.map((e:SignedLowSourceReview)=>env.DB.prepare(`INSERT INTO control_state(key,value_json,version,updated_at)
   VALUES (?,?,1,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,
    version=control_state.version+1,updated_at=excluded.updated_at
    WHERE excluded.updated_at>control_state.updated_at`)
   .bind(PREFIX+e.review.input_id,JSON.stringify(e),e.review.reviewed_at));
  statements.push(env.DB.prepare("DELETE FROM control_state WHERE key GLOB ? AND json_extract(value_json,'$.review.expires_at')<=?")
   .bind(PREFIX+'*',new Date(now).toISOString()));
  statements.push(env.DB.prepare(`DELETE FROM control_state WHERE key IN
   (SELECT key FROM control_state WHERE key GLOB ? ORDER BY
    json_extract(value_json,'$.review.source_published_at') DESC,key LIMIT -1 OFFSET 600)`).bind(PREFIX+'*'));
  const results=await env.DB.batch(statements);
  if(results.some((r:any)=>r.success===false))throw Error('WRITE');
  return reply({ok:true,accepted:body.items.length});
 }catch{return reply({ok:false,error:'INTERNAL_REVIEW_NOT_ACCEPTED'},400);}
}
