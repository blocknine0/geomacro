import { createHash } from "node:crypto";
import fs from "node:fs";
import process from "node:process";

const FILES=[
  "src/routes/api.risk-gate.ts",
  "workers/control-plane/src/predge-risk-gate-d1.mjs",
  "workers/control-plane/migrations/0020_predge_risk_gate_d1.sql",
  "src/lib/risk-gate-engine.ts",
  "src/lib/risk-gate-explainability.ts",
  "src/lib/risk-gate-contract.ts",
  "src/lib/risk-object-contract.ts",
];
const candidateSha=String(process.env.RISK_GATE_DISTRIBUTED_CANDIDATE_SHA||"").trim().toLowerCase();
if(candidateSha&&!/^[a-f0-9]{40}$/.test(candidateSha))throw Error("INVALID_CANDIDATE_SHA");
const providers=/\b(groq|cerebras|openai|anthropic|gemini|vertex\s*ai|bedrock|mistral|together\s*ai|perplexity)\b/i;
const sources=FILES.map(path=>{
 const content=fs.readFileSync(path,"utf8");
 if(providers.test(content))throw Error("MODEL_PROVIDER_IN_SYNCHRONOUS_PATH:"+path);
 return {path,sha256:createHash("sha256").update(content).digest("hex")};
});
const route=fs.readFileSync(FILES[0],"utf8");
const worker=fs.readFileSync(FILES[1],"utf8");
const schema=fs.readFileSync(FILES[2],"utf8");
const assertions=[
 [route.includes("forwardRiskGateToD1")&&!route.includes("risk-gate-commercial-boundary.server"),
  "live request path must never use legacy Supabase Risk Gate handler"],
 [worker.includes("evaluateRiskGate")&&worker.includes("verifyHotGRO"),
  "same deterministic engine after exact GRO verification"],
 [worker.includes("PREDGE_RISK_GATE_TOKEN")&&worker.includes("RISK_GATE_VERIFY_KEYS_JSON"),
  "isolated secret and pinned signing key"],
 [worker.includes("RETURNING used")&&schema.includes("risk_gate_d1_quota"),
  "D1 atomic quota"],
 [schema.includes("PRIMARY KEY(client_id,request_id)")&&worker.includes("response_json"),
  "idempotent D1 replay ledger"],
 [worker.includes("execution_authorized:false")&&worker.includes("CURRENT_SIGNED_GRO_UNAVAILABLE"),
  "fail-closed risk gate"],
 [!worker.includes("Supabase.")&&!worker.includes("requireRiskSupabase(")&&
  !route.includes("requireRiskSupabase("),"no synchronous Supabase call"],
];
for(const [ok,msg] of assertions)if(!ok)throw Error(msg);
const output={
 schema_version:"geomacro.risk-gate-provider-path-audit.v2",
 generated_at:new Date().toISOString(),
 candidate_sha:candidateSha||null,
 synchronous_request_path:"website /api/risk-gate -> Cloudflare Worker purpose-scoped auth -> D1 atomic quota/idempotency -> signed GRO verification -> canonical deterministic risk-gate-engine -> D1 immutable decision replay",
 supabase_used_in_request_path:false,
 external_model_provider_in_synchronous_request_path: false,
 external_model_provider_saturation:{
  status:"not_applicable_to_synchronous_risk_gate_request_path",
  reason:"Signed GRO and deterministic Risk Gate engine; no external model-provider requests",
 },
 legacy_supabase_modules_still_present_in_repository:true,
 production_load_tested:false,
 payment_or_mainnet_activation:false,
 audited_sources:sources,
 pass:true
};
fs.mkdirSync("artifacts",{recursive:true});
fs.writeFileSync("artifacts/risk-gate-provider-path-audit.json",JSON.stringify(output,null,2)+"\n");
console.log("PASS: D1-native Risk Gate synchronous request path has no Supabase or model-provider dependency.");
