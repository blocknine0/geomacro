import {createHash} from "node:crypto";
import {describe,expect,it} from "vitest";
import {CommerceLedger} from "../../workers/commerce-ledger/src/index.mjs";
import {quoteGeomacroCapability} from "./capability-pricing";
import {stableCommerceJson} from "./agent-commerce-delivery.server";
const h=(s:string)=>createHash("sha256").update(s).digest("hex");
function ledger(){
 const map=new Map<string,unknown>();
 const storage={
   get:async(k:string)=>structuredClone(map.get(k)),
   transaction:async(cb:(tx:{get:(key:string)=>Promise<unknown>;put:(key:string,value:unknown)=>Promise<void>})=>Promise<unknown>)=>
     cb({get:async k=>structuredClone(map.get(k)),put:async(k,v)=>{map.set(k,structuredClone(v));}}),
 };
 return new CommerceLedger({storage} as never,{} as never);
}
async function post(x:CommerceLedger,action:string,body:Record<string,unknown>){
 const r=await x.fetch(new Request("https://ledger.internal/"+action,{
   method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)
 }));
 return {status:r.status,value:await r.json() as Record<string,unknown>};
}
const seller="0x"+"a".repeat(40);
function freshOffer(rail:"coinbase_x402"|"circle_gateway_x402"="coinbase_x402"){
 const content=stableCommerceJson({signed_risk_objects:[{object_id:"test"}],execution_authorized:false});
 const quote=quoteGeomacroCapability({
  capability:"risk_gate_bundle",variant:"standard",rail,availabilityVerified:true,
  network:"eip155:8453",asset:"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  recipient:seller,requestFingerprint:h("query"),preparedAnswerSha256:h(content),
 });
 return {quote,customerBytes:content,provider:rail,
   providerEnvironment:rail==="coinbase_x402"?"mainnet":"production"};
}
describe("capability prequote immutable original bytes in existing Durable Object — NO FUNDS",()=>{
 it("freezes and reads identical prepared answer, never authorizes payment",async()=>{
  const l=ledger(),input=freshOffer();
  expect((await post(l,"capability-prequote-freeze",input)).value.disposition).toBe("FROZEN");
  const read=await post(l,"capability-prequote-readback",{quoteId:input.quote.quote_id});
  expect(read.status).toBe(200);
  expect(read.value.customerBytes).toBe(input.customerBytes);
  expect(read.value.payment_authorized).toBe(false);
  expect(read.value.settlement_attempted).toBe(false);
  expect((await post(l,"capability-prequote-freeze",input)).value.disposition).toBe("EXACT_REPLAY");
  expect((await post(l,"capability-prequote-freeze",{
   ...input,customerBytes:input.customerBytes+" " })).status).toBe(409);
  expect((await post(l,"capability-prequote-freeze",{
   ...input,quote:{...input.quote,amount_atomic:"250000"}
  })).status).toBe(409);
 });
 it("separates Coinbase and Circle and refuses missing, corrupted or unsigned answer bytes",async()=>{
  const l=ledger(),cb=freshOffer("coinbase_x402"),circle=freshOffer("circle_gateway_x402");
  expect(cb.quote.quote_id).not.toBe(circle.quote.quote_id);
  expect((await post(l,"capability-prequote-readback",{quoteId:cb.quote.quote_id})).status).toBe(409);
  expect((await post(l,"capability-prequote-freeze",{...cb,
    quote:{...cb.quote,prepared_answer_sha256:h("wrong")}})).status).toBe(409);
  expect((await post(l,"capability-prequote-freeze",circle)).status).toBe(200);
  expect((await post(l,"capability-prequote-readback",{quoteId:circle.quote.quote_id})).status).toBe(200);
 });
});
