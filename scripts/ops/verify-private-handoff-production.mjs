#!/usr/bin/env node
/**
 * Outside-in, read-only acceptance for the protected original-reference bridge.
 *
 * A successful Worker deployment does not establish that the newly deployed
 * handoff/index routes or their separate capabilities actually work. This
 * canary never signs events, writes D1/B2, fetches source pages or authorizes
 * commercial publication. It emits only fixed error codes and aggregate counts.
 */
import {createHmac} from "node:crypto";
import {pathToFileURL} from "node:url";
import {resolve} from "node:path";

const SHA=/^[a-f0-9]{64}$/u;
const SIGNAL=/^(?:geopolitics|macro|rare_earth)-[a-f0-9]{8}$/u;
const BASE="https://geomacro-control-plane.daspallab202391.workers.dev";
const fail=code=>{throw Error("PRIVATE_HANDOFF_ACCEPTANCE_"+code)};
const token=(root,label)=>createHmac("sha256",root).update(label).digest("hex");

export async function verifyPrivateHandoffDeployment({
  env=process.env,fetchImpl=fetch,
}={}){
  const root=String(env.ROOT_LEDGER_TOKEN??"");
  const origin=String(env.CONTROL_PLANE_URL??BASE).replace(/\/$/u,"");
  if(root.trim().length<32 || root!==root.trim())fail("PROTECTED_ROOT_ABSENT");
  const allowed=new URL(BASE);
  let actual;
  try{actual=new URL(origin)}catch{fail("ORIGIN_INVALID")}
  if(actual.protocol!=="https:"||actual.username||actual.password||actual.port||
    actual.pathname!=="/"||actual.search||actual.hash||
    !actual.hostname.endsWith(".workers.dev"))fail("ORIGIN_INVALID");
  const admin=token(root,"geomacro-control-plane-v1");
  const low=token(admin,"geomacro-low-source-review-v1");
  const request=async(path,credential,method="GET")=>{
    const response=await fetchImpl(origin+path,{
      method,redirect:"error",cache:"no-store",
      headers:credential?{Authorization:"Bearer "+credential,Accept:"application/json"}:
        {Accept:"application/json"},
      signal:AbortSignal.timeout(12000),
    });
    if(response.redirected)fail("REDIRECT");
    return response;
  };
  const expectStatus=(res,code,expected)=>{
    if(res.status!==expected)fail(code+"_HTTP_"+String(res.status).replace(/[^0-9]/gu,""));
  };
  const read=async(res,code)=>{
    const declared=Number(res.headers?.get?.("content-length")??0);
    if(!Number.isFinite(declared)||declared>300000)fail(code+"_OVERSIZE");
    const raw=await res.text();
    if(new TextEncoder().encode(raw).byteLength>300000)fail(code+"_OVERSIZE");
    try{return JSON.parse(raw)}catch{fail(code+"_MALFORMED")}
  };

  // A producer/admin can read only its own signed input index.
  const idxResponse=await request("/v1/intelligence-inputs/automated?view=handoff-ids",admin);
  expectStatus(idxResponse,"SIGNED_INPUT_INDEX",200);
  const idx=await read(idxResponse,"SIGNED_INPUT_INDEX");
  if(idx.ok!==true||idx.schema!=="geomacro.automated-intelligence-input-feed.v1"||
     !Array.isArray(idx.handoffs)||idx.handoffs.length>600||
     idx.handoffs.some(x=>!SHA.test(x?.input_id)||!SIGNAL.test(x?.signal_id)))
    fail("SIGNED_INPUT_INDEX_CONTRACT");

  // LOW can read only the verified, bounded private handoff pages.
  const handoffResponse=await request("/v1/internal/source-handoffs?offset=0",low);
  expectStatus(handoffResponse,"LOW_READER",200);
  const handoff=await read(handoffResponse,"LOW_READER");
  if(handoff.ok!==true||handoff.schema!=="geomacro.private-source-handoff-feed.v1"||
     handoff.offset!==0||!Array.isArray(handoff.items)||handoff.items.length>40||
     !(handoff.next_offset===null||
        Number.isSafeInteger(handoff.next_offset)&&handoff.next_offset>0&&handoff.next_offset<=40))
    fail("LOW_READER_CONTRACT");

  // Test least-privilege denial without ever performing a write or supplying
  // an input body. Unauthorized PUT must fail before the route reads a body.
  expectStatus(await request("/v1/internal/source-handoffs",admin),"ADMIN_CANNOT_READ",401);
  expectStatus(await request("/v1/internal/source-handoffs",low,"PUT"),"LOW_CANNOT_WRITE",401);
  expectStatus(await request("/v1/intelligence-inputs/automated?view=handoff-ids",low),
    "LOW_CANNOT_READ_ADMIN_INDEX",401);
  expectStatus(await request("/v1/internal/source-handoffs"),"ANONYMOUS_CANNOT_READ",401);

  return Object.freeze({
    schema:"geomacro.private-handoff-production-acceptance.v1",
    signed_input_index_readable:true,
    bounded_private_handoff_readable:true,
    distinct_capability_boundaries_verified:true,
    signed_inputs_retained:idx.handoffs.length,
    private_handoff_page_rows:handoff.items.length,
    private_handoff_item_content_exposed:false,
    semantic_facts_verified:false,article_specific_rights_verified:false,
    current_signed_hot_products_verified:false,
    b2_requests:0,d1_writes:0,supabase_requests:0,payments:0,
  });
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{console.log(JSON.stringify(await verifyPrivateHandoffDeployment()))}
  catch(error){
    const code=error instanceof Error&&
      /^PRIVATE_HANDOFF_ACCEPTANCE_[A-Z0-9_]+$/u.test(error.message)
      ?error.message:"PRIVATE_HANDOFF_ACCEPTANCE_TRANSPORT_OR_RUNTIME_UNAVAILABLE";
    console.error("::error::"+code);
    process.exitCode=2;
  }
}
