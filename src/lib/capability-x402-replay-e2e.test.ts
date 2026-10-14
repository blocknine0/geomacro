import {createHash} from "node:crypto";
import {describe,it,expect,vi,afterEach} from "vitest";
import {CommerceLedger} from "../../workers/commerce-ledger/src/index.mjs";
import {quoteGeomacroCapability} from "./capability-pricing";
import {coinbaseRequirementsForCapabilityQuote,
 capabilityLedgerRequestFingerprint,capabilityQuotePaymentExtension}
 from "./capability-x402-payment-contract.server";
import {readAlreadyDeliveredCapabilityReplay} from "./capability-x402-replay.server";
import {commerceFingerprint,commerceReferenceHash} from "./agent-commerce-delivery.server";
import {coinbasePaymentFingerprint,type CoinbaseX402Config} from "./coinbase-x402.server";

const hash=(s:string)=>createHash("sha256").update(s).digest("hex");
class Storage{
 readonly rows=new Map<string,unknown>();
 get=async(key:string)=>structuredClone(this.rows.get(key));
 transaction=async<T>(fn:(tx:{get:(k:string)=>Promise<unknown>;put:(k:string,v:unknown)=>Promise<void>})=>Promise<T>)=>
  fn({get:this.get,put:async(k,v)=>{this.rows.set(k,structuredClone(v));}});
}
async function post(worker:CommerceLedger,action:string,payload:Record<string,unknown>){
 const r=await worker.fetch(new Request("https://ledger.internal/"+action,{
  method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)
 }));
 expect(r.status).toBe(200);
 return r.json() as Promise<Record<string,unknown>>;
}
const payTo="0x"+"b".repeat(40);
const config:CoinbaseX402Config={
 environment:"production",commercialEnvironment:"mainnet",network:"eip155:8453",
 networkName:"Base",chainId:"8453",asset:"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
 payTo,priceUsdc:"0.05",amountAtomic:"50000",apiKeyId:null,apiKeySecret:null,
};
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();});
describe("expired quote replay through real Durable Object ledger adapter, NO FUNDS",()=>{
 it("returns exact previously settled bytes without new charge; rejects altered payments",async()=>{
  const sent=new Date(Date.now()-12*60_000);
  const quote=quoteGeomacroCapability({
   capability:"risk_gate_bundle",variant:"complex_multi_source",
   requestFingerprint:hash("original-canonical-question"),
   preparedAnswerSha256:hash("immutable-original-answer"),
   network:config.network,asset:config.asset,recipient:payTo,
   rail:"coinbase_x402",availabilityVerified:true,now:sent,
  });
  const quotedInstant=new Date(Date.parse(quote.issued_at)+1000);
  const requirement=coinbaseRequirementsForCapabilityQuote(config,quote,quotedInstant);
  const paymentPayload={x402Version:2,accepted:requirement,
   extensions:capabilityQuotePaymentExtension(quote,quotedInstant)};
  const paymentFingerprint=coinbasePaymentFingerprint(paymentPayload);
  const requestFingerprint=capabilityLedgerRequestFingerprint(quote,quotedInstant);
  const storage=new Storage();
  const worker=new CommerceLedger({storage} as never,{} as never);
  const claim={
   provider:"coinbase_x402",providerEnvironment:"mainnet",paymentFingerprint,
   requestFingerprint,productId:"geomacro_coinbase_x402_v1",
   rail:"coinbase_cdp_exact",network:quote.network,asset:quote.asset_contract,
   amountAtomic:quote.amount_atomic,recipientHash:commerceReferenceHash(quote.recipient),
  };
  const initial=await post(worker,"claim",claim);
  expect(initial.disposition).toBe("CLAIMED");
  const payload={request_id:"original",derived:"exact stable response",risk_gate:{
   included_signed_object_charge:"INCLUDED_NO_DOUBLE_CHARGE"
  }};
  const sha=commerceFingerprint(payload);
  expect((await post(worker,"prepare",{
   paymentFingerprint,claimToken:initial.claim_token,responsePayload:payload,
   responseSha256:sha,
  })).ok).toBe(true);
  expect((await post(worker,"complete",{
   paymentFingerprint,claimToken:initial.claim_token,
   settlementReference:"synthetic-only-not-real-money",
   settlementNetwork:"eip155:8453",
  })).ok).toBe(true);
  vi.stubEnv("GEOMACRO_COMMERCE_LEDGER_URL","https://ledger.test");
  vi.stubEnv("GEOMACRO_COMMERCE_LEDGER_TOKEN","t".repeat(40));
  const called=vi.spyOn(globalThis,"fetch").mockImplementation(async(request,options)=>{
    expect(String(request)).toBe("https://ledger.test/v1/delivery/replay");
    const args=JSON.parse(String(options?.body));
    return worker.fetch(new Request("https://ledger.internal/replay",{
      method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(args),
    }));
  });
  const replay=await readAlreadyDeliveredCapabilityReplay({
    quote,paymentPayload,paymentFingerprint,
    requestFingerprint:quote.request_fingerprint_sha256,config,
  });
  expect(replay?.response).toEqual(payload);
  expect(called).toHaveBeenCalledOnce();
  const altered={...paymentPayload,accepted:{...requirement,amount:"50000"}};
  await expect(readAlreadyDeliveredCapabilityReplay({
    quote,paymentPayload:altered,paymentFingerprint,
    requestFingerprint:quote.request_fingerprint_sha256,config,
  })).rejects.toThrow("X402_CAPABILITY_PAYMENT_TERMS_MISMATCH");
  const different=await readAlreadyDeliveredCapabilityReplay({
    quote,paymentPayload,paymentFingerprint:hash("unpaid-different-payment"),
    requestFingerprint:quote.request_fingerprint_sha256,config,
  });
  expect(different).toBeNull();
  expect(storage.rows.size).toBe(2);
 });
});
