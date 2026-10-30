import {describe,it,expect} from "vitest";
import {GEOMACRO_USDC_NATIVE_RAILS} from "./usdc-native-rail-identities";
import {validateBuyerUsdcOffer,assertBuyerDeliveredBytes} from "./usdc-buyer-quote";
const origin="https://geomacro.live",now=Date.parse("2026-10-21T12:00:00Z");
const recipient="0x1111111111111111111111111111111111111111";
const make=(id:keyof typeof GEOMACRO_USDC_NATIVE_RAILS)=>{
 const rail=GEOMACRO_USDC_NATIVE_RAILS[id];
 return {x402Version:2,resource:{url:origin+"/api/v1/intelligence/query",mimeType:"application/json"},
  accepts:[{scheme:"exact",network:rail.caip2,asset:rail.asset,amount:"100000",payTo:recipient,
   maxTimeoutSeconds:60,extra:{name:"USDC",version:"2"}}],extensions:{geomacro:{info:{execution_authorized:false,
   capability_quote:{quote_id:"a".repeat(64),prepared_answer_sha256:"b".repeat(64),
    version:"geomacro.capability-usdc.v2",
    recipient,network:rail.caip2,asset_contract:rail.asset.toLowerCase(),capability:"intelligence_query",
    variant:"standard",amount_usdc:"0.03",amount_atomic:"30000",expires_at:"2026-10-21T12:04:00Z"}}}}};
};
describe("browser exact USDC offer and response verification",()=>{
 it("supports each native rail without ever treating supported software as an active merchant",()=>{
  for(const id of ["base","polygon","arc"] as const)
   expect(validateBuyerUsdcOffer(make(id),id,origin,now).amount_usdc).toBe("0.03");
 });
 it("rejects chain substitution, amount drift, zero recipient and expired offers",()=>{
  expect(()=>validateBuyerUsdcOffer(make("base"),"polygon",origin,now)).toThrow();
  const amount=make("base");amount.accepts[0].amount="1";
  expect(()=>validateBuyerUsdcOffer(amount,"base",origin,now)).toThrow();
  const address=make("base");address.accepts[0].payTo="0x"+"0".repeat(40);
  expect(()=>validateBuyerUsdcOffer(address,"base",origin,now)).toThrow();
  const gateway=make("base");gateway.accepts[0].extra.name="GatewayWalletBatched";
  expect(()=>validateBuyerUsdcOffer(gateway,"base",origin,now)).toThrow();
  expect(()=>validateBuyerUsdcOffer(make("base"),"base",origin,now+300000)).toThrow();
 });
 it("requires the exact frozen customer bytes rather than merely HTTP 200",async()=>{
  const raw='{"answer":"derived"}';
  const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(raw));
  const hash=Array.from(new Uint8Array(bytes),v=>v.toString(16).padStart(2,"0")).join("");
  expect(await assertBuyerDeliveredBytes(raw,hash)).toEqual({answer:"derived"});
  await expect(assertBuyerDeliveredBytes(raw+" ",hash)).rejects.toThrow("HASH_MISMATCH");
 });
});
