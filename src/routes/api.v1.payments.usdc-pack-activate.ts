import process from "node:process";
import {createFileRoute} from "@tanstack/react-router";
import {verifyMainnetUsdcTransferReceipt, type MainnetUsdcChainId} from "../lib/direct-usdc-pay-per-call.server";

const FALLBACK="https://geomacro-control-plane.daspallab202391.workers.dev";
const HEADERS={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"} as const;
const PACKS=Object.freeze({
 "risk-gate-small":{amountUsd:15,credits:1500,amountAtomic:"15000000"},
 "risk-gate-standard":{amountUsd:30,credits:3000,amountAtomic:"30000000"},
 "risk-gate-best":{amountUsd:60,credits:6000,amountAtomic:"60000000"},
});
const NETWORKS=new Set<MainnetUsdcChainId>(["base","polygon","arc"]);
type Json=Record<string,unknown>;
function failure(code:string,status:number){return Response.json({ok:false,code},{status,headers:HEADERS});}
function controlPlane(){
 const origin=String(process.env.GEOMACRO_CONTROL_PLANE_URL??FALLBACK).trim().replace(/\/+$/u,"");
 let url:URL;try{url=new URL(origin);}catch{throw Error("USDC_PACK_CONTROL_PLANE_CONFIG_INVALID");}
 if(url.protocol!=="https:"||url.username||url.password||url.search||url.hash||url.pathname!=="/")
  throw Error("USDC_PACK_CONTROL_PLANE_CONFIG_INVALID");
 const token=String(process.env.GEOMACRO_COMMERCE_LEDGER_TOKEN??"").trim();
 if(token.length<32)throw Error("USDC_PACK_LEDGER_TOKEN_MISSING");
 return {origin:url.origin,token};
}
async function callStore(payload:Json){
 const {origin,token}=controlPlane();
 const response=await fetch(origin+"/v1/store/usdc-pack-activate",{
  method:"POST",redirect:"manual",headers:{"content-type":"application/json",authorization:`Bearer ${token}`},
  body:JSON.stringify(payload),signal:AbortSignal.timeout(8000),
 });
 let value:Json={};try{value=await response.json() as Json;}catch{}
 return {response,value};
}

export const Route=createFileRoute("/api/v1/payments/usdc-pack-activate")({server:{handlers:{
 GET:async()=>{
  try{
   const {response,value}=await callStore({action:"status"});
   return Response.json({ok:response.ok&&value.ok===true,checkout_enabled:response.ok&&value.checkout_enabled===true,
    code:typeof value.code==="string"?value.code:null},{status:response.ok?200:503,headers:HEADERS});
  }catch{return Response.json({ok:false,checkout_enabled:false,code:"USDC_PACK_CHECKOUT_UNAVAILABLE"},{status:503,headers:HEADERS});}
 },
 OPTIONS:async()=>new Response(null,{status:204,headers:{...HEADERS,"Access-Control-Allow-Methods":"GET, POST, OPTIONS"}}),
 POST:async({request}:{request:Request})=>{
  const customer=await import("../lib/customer-auth.server");
  try{
   customer.rejectCrossOrigin(request);
   const body=await customer.customerBody(request);
   if(Object.keys(body).some(key=>! ["network","sku","tx_hash"].includes(key))||
      typeof body.network!=="string"||!NETWORKS.has(body.network as MainnetUsdcChainId)||
      typeof body.sku!=="string"||!Object.hasOwn(PACKS,body.sku)||
      typeof body.tx_hash!=="string"||!/^0x[0-9a-f]{64}$/i.test(body.tx_hash))
    return failure("USDC_PACK_REQUEST_INVALID",400);
   const user=await customer.authenticatedCustomer(request);
   const pack=PACKS[body.sku as keyof typeof PACKS];
   let proof;
   try{
    proof=await verifyMainnetUsdcTransferReceipt({network:body.network as MainnetUsdcChainId,
     txHash:body.tx_hash,minAmountAtomic:pack.amountAtomic});
   }catch(error){
    const code=error instanceof Error&&/^[A-Z0-9_]{1,80}$/u.test(error.message)?error.message:"USDC_TRANSFER_VERIFICATION_FAILED";
    return failure(code,code.startsWith("RPC_")?503:402);
   }
   if(proof.amount_atomic!==pack.amountAtomic)return failure("USDC_PACK_EXACT_AMOUNT_REQUIRED",402);
   const sessionToken=customer.customerSessionToken(request);
   let upstream;
   try{upstream=await callStore({action:"activate",network:body.network,sku:body.sku,
    tx_hash:proof.tx_hash,session_token:sessionToken});}
   catch{return failure("USDC_PACK_CONTROL_PLANE_UNAVAILABLE",503);}
   if(!upstream.response.ok||upstream.value.ok!==true)
    return Response.json({ok:false,code:typeof upstream.value.error==="string"?upstream.value.error:"USDC_PACK_ACTIVATION_FAILED"},
     {status:upstream.response.status,headers:HEADERS});
   let key:Json|null=null;
   try{key=await (await import("../lib/customer-commercial.server")).issueCustomerKey(request) as Json;}
   catch(error){
    const code=error instanceof customer.CustomerError?error.code:"CUSTOMER_KEY_ISSUANCE_PENDING";
    return Response.json({...upstream.value,ok:true,api_key:null,key_issued:false,key_issuance_code:code,
     email:user.email},{status:200,headers:HEADERS});
   }
   return Response.json({...upstream.value,ok:true,api_key:typeof key.api_key==="string"?key.api_key:null,
    key_id:typeof key.key_id==="string"?key.key_id:null,key_issued:typeof key.api_key==="string",email:user.email},
    {status:200,headers:HEADERS});
  }catch(error){return customer.customerFailure(error);}
 },
}}});
