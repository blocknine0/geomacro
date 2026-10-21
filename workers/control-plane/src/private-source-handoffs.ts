import {verifyPrivateSourceHandoff,type PrivateSourceHandoff} from '../../../src/lib/private-source-handoff.ts';
import {lowReviewToken} from './low-source-reviews.ts';
const PREFIX='automated_source_handoff_v1:';
const reply=(v:unknown,status=200)=>Response.json(v,{status,headers:{
 'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
const equal=(a:string,b:string)=>{
 let diff=a.length^b.length;for(let i=0;i<b.length;i++)diff|=(a.charCodeAt(i)||0)^b.charCodeAt(i);return diff===0;
};
export async function handlePrivateSourceHandoffs(request:Request,env:any,now=Date.now()){
 const root=String(env.CONTROL_PLANE_TOKEN??'').trim();
 if(root.length<32)return reply({ok:false,error:'PRIVATE_HANDOFF_UNAVAILABLE'},503);
 const auth=request.headers.get('authorization')??'',url=new URL(request.url);
 // Producer/admin may PUT; the LOW capability may only read this handoff.
 // LOW still cannot access arbitrary control state, hot publication or payments.
 const writer=equal(auth,'Bearer '+root),reader=equal(auth,'Bearer '+await lowReviewToken(root));
 if(!(request.method==='PUT'?writer:request.method==='GET'&&reader))
  return reply({ok:false,error:'UNAUTHORIZED'},401);
 try{
  const keys=JSON.parse(env.AUTOMATED_FINDS_VERIFY_KEYS_JSON??'{}');
  if(request.method==='GET'){
   const offset=Number(url.searchParams.get('offset')??0);
   if([...url.searchParams.keys()].some(k=>k!=='offset')||url.searchParams.getAll('offset').length>1||
    !Number.isSafeInteger(offset)||offset<0||offset>600)throw Error('QUERY');
   const result=await env.DB.prepare(`SELECT h.key,h.value_json,i.value_json AS input_json,r.value_json AS review_json
    FROM control_state h JOIN control_state i ON i.key='automated_input_v1:'||substr(h.key,?)
    LEFT JOIN control_state r ON r.key='low_source_review_v1:'||substr(h.key,?)
    WHERE h.key GLOB ? AND json_extract(h.value_json,'$.expires_at')>?
    AND json_extract(i.value_json,'$.payload.expires_at')>? ORDER BY h.key LIMIT 40 OFFSET ?`)
    .bind(PREFIX.length+1,PREFIX.length+1,PREFIX+'*',new Date(now).toISOString(),new Date(now).toISOString(),offset).all();
   if(result.success===false||!Array.isArray(result.results))throw Error('READ');
   const items=[];let bytes=0;
   for(const row of result.results){
    const saved=JSON.parse(row.value_json),input=JSON.parse(row.input_json);
    const verified=await verifyPrivateSourceHandoff({input_id:saved.input_id,ref:saved.ref},input,keys,now);
    if(saved.schema!==verified.schema||saved.expires_at!==verified.expires_at||
     row.key!==PREFIX+verified.input_id)throw Error('BINDING');
    const item={input,ref:verified.ref,previous_review:row.review_json?JSON.parse(row.review_json):null};
    const size=new TextEncoder().encode(JSON.stringify(item)).byteLength+1;
    if(bytes+size>250000){if(!items.length)throw Error('ITEM_OVERSIZE');break;}
    items.push(item);bytes+=size;
   }
   return reply({ok:true,schema:'geomacro.private-source-handoff-feed.v1',items,
    offset,next_offset:(items.length<result.results.length||result.results.length===40)&&offset+items.length<600
     ?offset+items.length:null});
  }
  if(url.search)throw Error('QUERY');
  const text=await request.text();if(new TextEncoder().encode(text).byteLength>250000)throw Error('SIZE');
  const body=JSON.parse(text);
  if(!body||Object.keys(body).join(',')!=='items'||!Array.isArray(body.items)||
   body.items.length<1||body.items.length>40)throw Error('SHAPE');
  const unique=new Map();
  for(const item of body.items as PrivateSourceHandoff[]){
   if(!/^[a-f0-9]{64}$/.test(item?.input_id??''))throw Error('IDENTITY');
   const stored=await env.DB.prepare('SELECT value_json FROM control_state WHERE key=?')
    .bind('automated_input_v1:'+item.input_id).first();
   if(!stored)throw Error('SIGNED_INPUT_REQUIRED');
   const row=await verifyPrivateSourceHandoff(item,JSON.parse(stored.value_json),keys,now);
   if(unique.has(row.input_id)&&JSON.stringify(unique.get(row.input_id))!==JSON.stringify(row))throw Error('COLLISION');
   unique.set(row.input_id,row);
  }
  const statements=[...unique].map(([id,row])=>env.DB.prepare(`INSERT INTO control_state(key,value_json,version,updated_at)
   VALUES (?,?,1,?) ON CONFLICT(key) DO NOTHING`).bind(PREFIX+id,JSON.stringify(row),new Date(now).toISOString()));
  statements.push(env.DB.prepare("DELETE FROM control_state WHERE key GLOB ? AND json_extract(value_json,'$.expires_at')<=?")
   .bind(PREFIX+'*',new Date(now).toISOString()));
  statements.push(env.DB.prepare(`DELETE FROM control_state AS h WHERE h.key GLOB ? AND NOT EXISTS
   (SELECT 1 FROM control_state i WHERE i.key='automated_input_v1:'||substr(h.key,?))`)
   .bind(PREFIX+'*',PREFIX.length+1));
  statements.push(env.DB.prepare(`DELETE FROM control_state WHERE key IN (SELECT key FROM control_state
   WHERE key GLOB ? ORDER BY json_extract(value_json,'$.expires_at') DESC,key LIMIT -1 OFFSET 600)`).bind(PREFIX+'*'));
  const results=await env.DB.batch(statements);
  if(results.some((r:any)=>r.success===false))throw Error('WRITE');
  return reply({ok:true,accepted_ids:[...unique.keys()]});
 }catch{return reply({ok:false,error:'PRIVATE_HANDOFF_NOT_VERIFIED'},400);}
}
