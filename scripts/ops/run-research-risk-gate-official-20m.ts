#!/usr/bin/env bun
/**
 * Protected scheduled producer. Only non-commercial first-party GOV.UK
 * originals, existing research-only Ed25519 issuer and staging Supabase.
 * This NEVER calls /api/risk-gate, a wallet, paid output, B2 or a RabbitMQ queue.
 */
import {readFileSync} from "node:fs";
import {runOfficialResearch20m} from "../lib/research-gate-official-20m.mjs";
import {ingestDirectlyForRiskGate,riskProjectConfig}
 from "../../src/lib/risk-gate/stream-ingest.ts";

function runtimeRequired(env){
 if(env.GITHUB_ACTIONS!=="true"||
    env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
    env.GITHUB_REF!=="refs/heads/main"||
    !["schedule","workflow_dispatch","workflow_run"].includes(env.GITHUB_EVENT_NAME??"")||
    env.GEOMACRO_RESEARCH_RISK_GATE_ENABLE!=="1")
  throw Error("RESEARCH_20M_PRODUCTION_CONTEXT_OR_SWITCH_INVALID");
 const project=riskProjectConfig(env);
 // Do not silently cross into the production commercial database.
 if(project.origin!=="https://ymjuwuvbialsevfawvvq.supabase.co")
  throw Error("RESEARCH_20M_ISOLATED_PROJECT_REQUIRED");
 for(const name of ["GEOMACRO_RESEARCH_SIGNING_PRIVATE_KEY_PKCS8_B64",
    "GEOMACRO_RESEARCH_SIGNING_PUBLIC_KEY_SPKI_B64",
    "GEOMACRO_RESEARCH_SIGNING_KEY_ID"]){
  if(!String(env[name]??"").trim())
   throw Error("RESEARCH_20M_SIGNER_NOT_CONFIGURED");
 }
}
runtimeRequired(process.env);
const doc=JSON.parse(readFileSync("config/official-ogl-atom-sources.json","utf8"));
if(doc?.schema!=="geomacro.official-free-atom-license-registry.v1"||
   !Array.isArray(doc.sources))
 throw Error("RESEARCH_20M_OFFICIAL_SOURCE_REGISTRY_INVALID");
const receipt=await runOfficialResearch20m({
 sources:doc.sources.filter(s=>s.private_research_only===true&&
  ["GEOPOLITICS","MACRO","CRITICAL_MINERALS"].includes(s.category)),
 now:new Date(),ingest:event=>ingestDirectlyForRiskGate(event),
});
console.log(JSON.stringify(receipt));
if(receipt.source_http_healthy===0)
 throw Error("RESEARCH_20M_NO_OFFICIAL_SOURCE_HTTP");
if(receipt.failures>0)
 console.warn("::warning::RESEARCH_20M_PARTIAL_SOURCE_OR_STATE_FAILURE");
// Publishing zero fresh records is not a fake success: the receipt says 0,
// and no empty/default 195x3 state is backfilled.
