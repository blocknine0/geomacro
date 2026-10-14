import {createHash} from "node:crypto";
import {describe,expect,it} from "vitest";
import {CommerceLedger} from "../../workers/commerce-ledger/src/index.mjs";
const sha=(x:string)=>createHash("sha256").update(x).digest("hex");
class Storage{
 readonly map=new Map<string,unknown>();
 get=async(key:string)=>structuredClone(this.map.get(key));
 transaction=async<T>(fn:(tx:{get:(k:string)=>Promise<unknown>;put:(k:string,v:unknown)=>Promise<void>})=>Promise<T>)=>
   fn({get:this.get,put:async(k,v)=>{this.map.set(k,structuredClone(v));}});
}
async function post(ledger:CommerceLedger,action:string,body:Record<string,unknown>){
 const r=await ledger.fetch(new Request("https://ledger.internal/"+action,{
  method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)
 }));
 return {status:r.status,body:await r.json() as Record<string,unknown>};
}
const claim={
 provider:"coinbase_x402",providerEnvironment:"mainnet",paymentFingerprint:sha("payment"),
 requestFingerprint:sha("quote+bytes+request"),productId:"geomacro_coinbase_x402_v1",
 rail:"coinbase_cdp_exact",network:"eip155:8453",asset:"0x"+"8".repeat(40),
 amountAtomic:"250000",recipientHash:sha("recipient"),clientRequestId:"request-0001",
};
describe("paid delivery historical replay never settles or changes bytes (NO FUNDS)",()=>{
 it("returns exactly one previously delivered payment; misses remain read-only",async()=>{
  const storage=new Storage();
  const ledger=new CommerceLedger({storage} as never,{} as never);
  const miss=await post(ledger,"replay",claim);
  expect(miss.body.disposition).toBe("NOT_FOUND");
  expect(storage.map.size).toBe(0);
  const first=await post(ledger,"claim",claim);
  const token=String(first.body.claim_token);
  const payload={derived:"identical immutable content",payment:{amount_atomic:"250000"}};
  const responseSha256=sha(JSON.stringify(payload));
  expect((await post(ledger,"prepare",{
    paymentFingerprint:claim.paymentFingerprint,claimToken:token,
    responsePayload:payload,responseSha256,
  })).body.ok).toBe(true);
  const notSettled=await post(ledger,"replay",claim);
  expect(notSettled.body.disposition).toBe("NOT_FOUND");
  expect((await post(ledger,"complete",{
    paymentFingerprint:claim.paymentFingerprint,claimToken:token,
    settlementReference:"synthetic-not-a-real-payment",
    settlementNetwork:"eip155:8453",
  })).body.ok).toBe(true);
  const replay=await post(ledger,"replay",claim);
  expect(replay.body.disposition).toBe("REPLAY");
  expect(replay.body.response_payload).toEqual(payload);
  expect(replay.body.response_sha256).toBe(responseSha256);
  for(const changed of [
    {amountAtomic:"50000"},{requestFingerprint:sha("new-request")},
    {recipientHash:sha("attacker")},{rail:"circle_gateway_batch"},
    {network:"eip155:84532"},{asset:"0x"+"7".repeat(40)},
    {productId:"different-priced-object"},
  ]){
    expect((await post(ledger,"replay",{...claim,...changed})).body.disposition).toBe("NOT_FOUND");
  }
  expect(storage.map.size).toBe(2);
 });
});
