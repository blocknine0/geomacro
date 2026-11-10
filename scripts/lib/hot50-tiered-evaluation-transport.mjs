/**
 * Private, no-funds Standard/three-tier acceptance fetcher. This uses the
 * same direct deployed control-plane origin as the commercial API's protected
 * RISK_EVIDENCE_ORIGIN default; custom-domain DNS/proxy parity is separately
 * certified and must not silently gate genuine upstream evaluation.
 *
 * Transport/protocol statuses are separate from category/source qualification.
 * A transport failure is NEVER classified as an evidence or signer deficiency.
 */
export const HOT50_TIERED_DIRECT_ORIGIN =
 "https://geomacro-control-plane.daspallab202391.workers.dev";
export const HOT50_TIERED_ENDPOINT =
 HOT50_TIERED_DIRECT_ORIGIN+"/v1/risk-gate/unified/evaluate";
const TIERS=new Set(["basic_focused","standard","complex_full"]);
const SHA=/^[0-9a-f]{64}$/u;
export async function probeHot50TieredProduct({
 country,tier,token,fetchImpl=fetch,timeoutMs=25000
}={}){
 if(!/^[A-Z]{3}$/u.test(country??"")||!TIERS.has(tier)||
    !SHA.test(token??"")||!Number.isSafeInteger(timeoutMs)||
    timeoutMs<1000||timeoutMs>30000)
  throw Error("HOT50_TIER_PROBE_INPUT_INVALID");
 let response;
 try{
  response=await fetchImpl(HOT50_TIERED_ENDPOINT,{
   method:"POST",redirect:"manual",
   signal:AbortSignal.timeout(timeoutMs),
   headers:{Authorization:"Bearer "+token,"Content-Type":"application/json",
    Accept:"application/json"},
   body:JSON.stringify({
    target_type:"COUNTRY",target_id:country,product_tier:tier,
    client_policy:"STRICT"
   }),
  });
 }catch{
  return {http_status:null,transport_state:"NETWORK_OR_TIMEOUT",
    contract_body:null};
 }
 if(!Number.isSafeInteger(response?.status)||response.status<100||
    response.status>599)
  return {http_status:null,transport_state:"INVALID_RESPONSE",contract_body:null};
 const http_status=response.status;
 if(http_status>=300&&http_status<400)
  return {http_status,transport_state:"REDIRECT_REJECTED",contract_body:null};
 const type=String(response.headers?.get?.("content-type")??"").toLowerCase();
 if(!type.includes("application/json")&&!type.includes("+json"))
  return {http_status,transport_state:"NON_JSON_RESPONSE",contract_body:null};
 let json;
 try{json=await response.json()}catch{
  return {http_status,transport_state:"INVALID_JSON",contract_body:null};
 }
 if(!json||typeof json!=="object"||Array.isArray(json))
  return {http_status,transport_state:"INVALID_JSON",contract_body:null};
 return {http_status,transport_state:"JSON_RESPONSE",contract_body:json};
}
