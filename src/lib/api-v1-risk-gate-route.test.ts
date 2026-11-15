import {createHash,generateKeyPairSync,sign} from "node:crypto";
import {describe,expect,it} from "vitest";
import {forwardDirectRiskGate} from "../routes/api.v1.risk-gate";
import {canonicalRiskObjectJson} from "./risk-object-signing.server";

const {privateKey,publicKey}=generateKeyPairSync("ed25519");
const spki=publicKey.export({format:"der",type:"spki"}).toString("base64");
const keyId="test-risk-gate-key";
function request(body:Record<string,unknown>){return new Request("https://geomacro.live/api/v1/risk-gate",{
  method:"POST",headers:{"content-type":"application/json","authorization":"Bearer gmk_live_"+"a".repeat(64)},
  body:JSON.stringify(body),
});}
function signedResponse(tier:string){
  const price={basic_focused:"0.15",standard:"0.20",complex_full:"0.30"}[tier as "basic_focused"|"standard"|"complex_full"];
  const payload={schema:"geomacro.progressive-risk-gate-decision.v1",execution_authorized:false,
    tier,billable:true,entry_status:"DELIVERED",billing_mode:"GEOMACRO_STORE_MONTHLY_RECHARGE",
    charge_usdc:price,risk_gate:{execution_authorized:false}};
  const canonical=canonicalRiskObjectJson(payload);
  return {ok:true,...payload,decision_signed_payload:payload,decision_signature_scheme:"Ed25519",
    decision_signature_key_id:keyId,decision_signature_scope:"geomacro.progressive-risk-gate-decision.v1",
    decision_payload_sha256:createHash("sha256").update(canonical).digest("hex"),
    decision_signature_b64:sign(null,Buffer.from(canonical),privateKey).toString("base64")};
}
function fetcherFor(value:Record<string,unknown>,seen:{url?:string;body?:Record<string,unknown>}={}){
 return async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=String(input);
  if(url.endsWith("/v1/public/risk-gate-decision-key"))return Response.json({ok:true,
    schema:"geomacro.risk-gate-decision-key.v1",scheme:"Ed25519",key_id:keyId,
    public_key_spki_b64:spki});
  seen.url=url;seen.body=JSON.parse(String(init?.body)) as Record<string,unknown>;
  return Response.json(value,{status:200});
 } as typeof fetch;
}

describe("unified direct Risk Gate endpoint",()=>{
 it("maps all three Predge tier names and the category to the guarded Store endpoint",async()=>{
  for(const [inputTier,internalTier,price] of [["BASIC","basic_focused","0.15"],
    ["STANDARD","standard","0.20"],["COMPLEX","complex_full","0.30"]] as const){
    const seen:{url?:string;body?:Record<string,unknown>}={};
    const response=await forwardDirectRiskGate(request({request_id:`direct-${inputTier}`,country_iso3:"IND",
      category:"MACRO_FX",tier:inputTier}),fetcherFor(signedResponse(internalTier),seen));
    expect(response.status).toBe(200);
    expect(seen.url).toMatch(/\/v1\/store\/risk-gate$/u);
    expect(seen.body).toMatchObject({category:"macro_fx",country_iso3:"IND",tier:internalTier});
    expect((await response.json()).charge_usdc).toBe(price);
  }
 });
 it("rejects invalid category, country, tier and missing customer credential before forwarding",async()=>{
  const unused=async()=>{throw new Error("must not fetch")} as typeof fetch;
  for(const body of [
   {request_id:"x",country_iso3:"IND",category:"WORLD",tier:"standard"},
   {request_id:"x",country_iso3:"IN",category:"GEOPOLITICS",tier:"standard"},
   {request_id:"x",country_iso3:"IND",category:"GEOPOLITICS",tier:"premium"},
  ])expect((await forwardDirectRiskGate(request(body),unused)).status).toBe(400);
  const unauth=new Request("https://geomacro.live/api/v1/risk-gate",{method:"POST",
   headers:{"content-type":"application/json"},body:JSON.stringify({request_id:"x",country_iso3:"IND",
    category:"GEOPOLITICS",tier:"standard"})});
  expect((await forwardDirectRiskGate(unauth,unused)).status).toBe(401);
 });
 it("fails closed on an invalid upstream Ed25519 decision",async()=>{
  const value=signedResponse("standard");value.decision_signature_b64="A".repeat(88);
  const response=await forwardDirectRiskGate(request({request_id:"direct-bad",country_iso3:"USA",
    category:"CRITICAL_MINERALS",tier:"standard"}),fetcherFor(value));
  expect(response.status).toBe(503);
  expect((await response.json()).error).toBe("RISK_GATE_D1_TRANSPORT_UNAVAILABLE");
 });
});
