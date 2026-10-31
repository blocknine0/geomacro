#!/usr/bin/env node
/**
 * Protected live GeoMacro SSR Base/Polygon RPC readiness. Read-only.
 * Does not fetch secrets from Lovable or log provider addresses/API keys.
 * Cannot sign, settle, transfer, or complete a paid delivery.
 */
import {createHmac} from "node:crypto";
import {mkdir,writeFile} from "node:fs/promises";
import {awaitExactGeomacroBuild} from "../lib/production-exact-build-readiness.mjs";

const token=String(process.env.GEOMACRO_COMMERCE_LEDGER_TOKEN??"");
const expectedSha=String(process.env.GITHUB_SHA??"");
const path="/api/v1/payments/networks";
const site="https://geomacro.live";
const output="artifacts/base-polygon-rpc-readiness/receipt.json";
const result={
  schema:"geomacro.no-funds-six-rpc-independent-acceptance.v1",
  examined_at:new Date().toISOString(),
  origin:site,
  expected_sha:expectedSha,
  deployed_exact_main:false,
  authenticated_production_ssr_rpc_readback:false,
  all_six_rpc_checked:false,
  finality_config_verified:false,
  finality_checks:[],
  no_payment_sent:true,
  payment_activation_changed:false,
  status:"BLOCKED",
  checks:[],
};
try{
  if(token.length<32 || !/^[0-9a-f]{40}$/u.test(expectedSha))
    throw Error("OWNER_PROTECTED_RUNTIME_TOKEN_OR_SHA_REQUIRED");
  // A single signed six-RPC probe is permissible only after exact main is live.
  // The no-secret build marker is retried while deployment propagates.
  result.deployed_exact_main=await awaitExactGeomacroBuild({origin:site,expectedSha});
  // Only a generated HMAC crosses the HTTPS boundary, never the ledger token.
  const at=Date.now();
  const msg="geomacro.rpc-readiness.v1\nPOST\n"+path+"\n"+String(at);
  const signature=createHmac("sha256",token).update(msg).digest("hex");
  const response=await fetch(site+path,{
    method:"POST",redirect:"error",cache:"no-store",
    headers:{
      "x-geomacro-rpc-audit-time":String(at),
      "x-geomacro-rpc-audit-hmac":signature,
      "Accept":"application/json",
    },
    signal:AbortSignal.timeout(90000),
  });
  if(Number(response.headers.get("content-length")||0)>65536)
    throw Error("DIAGNOSTIC_OVERSIZED");
  const raw=await response.text();
  if(raw.length>65536)throw Error("DIAGNOSTIC_OVERSIZED");
  let body={};
  try{body=JSON.parse(raw);}catch{throw Error("DIAGNOSTIC_NOT_JSON");}
  const slots=["base:primary","base:backup_1","base:backup_2",
    "polygon:primary","polygon:backup_1","polygon:backup_2"];
  if(body?.schema!=="geomacro.no-funds-six-rpc-readiness.v1"||
    !Array.isArray(body.checks)||body.checks.length!==6)
    throw Error("PRODUCTION_DIAGNOSTIC_UNAVAILABLE");
  result.egress_check=/^EGRESS_[A-Z_]{2,40}$/u.test(String(body.egress_check??""))?
    body.egress_check:"EGRESS_UNKNOWN";
  // Explicitly whitelist any log-bound fields to prevent credential leaks.
  result.checks=body.checks.map(c=>({
    network:["base","polygon"].includes(c.network)?c.network:"invalid",
    slot:["primary","backup_1","backup_2"].includes(c.slot)?c.slot:"invalid",
    status:/^[A-Z_]{2,40}$/u.test(String(c.status??""))?c.status:"UNKNOWN",
    provider_family:["ALCHEMY","ANKR","DRPC","OTHER"].includes(c.provider_family)?
      c.provider_family:"UNKNOWN",
  }));
  const actual=result.checks.map(c=>c.network+":"+c.slot);
  result.all_six_rpc_checked=slots.every(s=>actual.filter(a=>a===s).length===1);
  result.authenticated_production_ssr_rpc_readback=result.all_six_rpc_checked;
  // The protected live SSR response must prove the same configured finality
  // thresholds used by settlement verification. Never log the secret values.
  const expectedFinality=[
    {network:"base",required_confirmations:3},
    {network:"polygon",required_confirmations:128},
  ];
  const readback=Array.isArray(body.finality_checks)?body.finality_checks:[];
  result.finality_checks=expectedFinality.map((expected,i)=>{
    const observed=readback[i]??{};
    const match=observed.network===expected.network &&
      observed.required_confirmations===expected.required_confirmations &&
      observed.status==="MATCH";
    return {...expected,status:match?"MATCH":"NOT_VERIFIED"};
  });
  result.finality_config_verified=body.finality_config_verified===true &&
    readback.length===2 &&
    result.finality_checks.every(x=>x.status==="MATCH");

  const expectedFamilies=["ALCHEMY","ANKR","DRPC","ALCHEMY","ANKR","DRPC"];
  result.expected_provider_families_verified=result.all_six_rpc_checked &&
    result.checks.every((c,i)=>c.provider_family===expectedFamilies[i]);
  if(body.ok===true && response.status===200 &&
    result.all_six_rpc_checked && result.deployed_exact_main &&
    result.expected_provider_families_verified &&
    result.egress_check==="EGRESS_PASS" &&
    result.finality_config_verified &&
    result.checks.every(c=>c.status==="PASS"))
    result.status="SIX_PRIVATE_RPC_PROVIDERS_VERIFIED_NO_FUNDS";
}catch(e){
  result.error_code=e instanceof Error&&
    /^[A-Z_]{4,50}$/u.test(e.message)?e.message:"LIVE_CHECK_UNAVAILABLE";
}
await mkdir("artifacts/base-polygon-rpc-readiness",{recursive:true});
await writeFile(output,JSON.stringify(result,null,2)+"\n");
console.log(JSON.stringify(result));
if(result.status!=="SIX_PRIVATE_RPC_PROVIDERS_VERIFIED_NO_FUNDS")
  process.exitCode=1;
