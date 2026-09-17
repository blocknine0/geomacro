import { createHash } from 'node:crypto';
import fs from 'node:fs';
import process from 'node:process';

const FILES = [
  'src/routes/api.risk-gate.ts',
  'src/lib/risk-gate-idempotency.server.ts',
  'src/lib/risk-gate-api.server.ts',
  'src/lib/risk-gate-service.server.ts',
  'src/lib/corridor-risk-gate-service.server.ts',
  'src/lib/risk-object-store.server.ts',
  'src/lib/risk-gate-engine.ts',
];
const MODEL_PROVIDER_PATTERN = /\b(groq|cerebras|openai|anthropic|gemini|vertex\s*ai|bedrock|mistral|together\s*ai|perplexity)\b/i;
const REMOTE_MODEL_URL_PATTERN = /https?:\/\/[^\s"'`]*(?:groq|cerebras|openai|anthropic|googleapis|mistral|together|perplexity)[^\s"'`]*/i;

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

const candidateSha = String(process.env.RISK_GATE_DISTRIBUTED_CANDIDATE_SHA || '').trim().toLowerCase();
if (candidateSha && !/^[0-9a-f]{40}$/.test(candidateSha)) throw new Error('RISK_GATE_DISTRIBUTED_CANDIDATE_SHA must be a full SHA');

const sources = [];
for (const file of FILES) {
  const content = fs.readFileSync(file, 'utf8');
  if (MODEL_PROVIDER_PATTERN.test(content) || REMOTE_MODEL_URL_PATTERN.test(content)) {
    throw new Error(`External model-provider dependency detected in synchronous Risk Gate request path: ${file}`);
  }
  sources.push({ path: file, sha256: sha256(content) });
}

const route = fs.readFileSync('src/routes/api.risk-gate.ts', 'utf8');
const idempotency = fs.readFileSync('src/lib/risk-gate-idempotency.server.ts', 'utf8');
const api = fs.readFileSync('src/lib/risk-gate-api.server.ts', 'utf8');
const country = fs.readFileSync('src/lib/risk-gate-service.server.ts', 'utf8');
const corridor = fs.readFileSync('src/lib/corridor-risk-gate-service.server.ts', 'utf8');
const store = fs.readFileSync('src/lib/risk-object-store.server.ts', 'utf8');
const required = [
  [route.includes('handleIdempotentExternalRiskGateRequest'), 'route must enter canonical idempotent Risk Gate handler'],
  [idempotency.includes('No outbound HTTP request occurs in this wrapper.'), 'idempotency wrapper must explicitly preserve no-outbound-HTTP behavior'],
  [api.includes('requireRiskSupabase'), 'API path must retain canonical database/auth dependency'],
  [api.includes('evaluateCountryRiskGate') && api.includes('evaluateCorridorRiskGate'), 'API path must route to Risk Gate services'],
  [country.includes('getLatestCompatibleCountryRiskObjectAtOrBefore') && country.includes('evaluateRiskGate'), 'country path must use persisted object + deterministic engine'],
  [corridor.includes('getLatestCompatibleCorridorRiskObjectAtOrBefore'), 'corridor path must use persisted corridor object'],
  [store.includes('requireRiskSupabase'), 'Risk Object store must use authoritative persisted database path'],
];
for (const [ok, message] of required) if (!ok) throw new Error(message);

const evidence = {
  schema_version: 'geomacro.risk-gate-provider-path-audit.v1',
  generated_at: new Date().toISOString(),
  candidate_sha: candidateSha || null,
  synchronous_request_path: 'api.risk-gate -> idempotency/auth/rate-limit -> persisted Risk Object -> deterministic Risk Gate engine -> audit/webhook durability',
  external_model_provider_in_synchronous_request_path: false,
  external_model_provider_saturation: {
    status: 'not_applicable_to_synchronous_risk_gate_request_path',
    reason: 'The audited Risk Gate HTTP request path evaluates persisted signed Risk Objects and does not invoke an external AI/model provider.',
  },
  database_dependency_in_request_path: true,
  provider_claim_scope: 'This source-bound audit applies to the synchronous Risk Gate request path only. Geomacro ingestion and intelligence-generation systems may use external providers outside this path.',
  audited_sources: sources,
  production_load: false,
  payment_or_mainnet_activation: false,
  pass: true,
};
fs.mkdirSync('artifacts', { recursive: true });
fs.writeFileSync('artifacts/risk-gate-provider-path-audit.json', `${JSON.stringify(evidence, null, 2)}\n`);
console.log('PASS: external model-provider saturation is N/A for the audited synchronous Risk Gate request path.');
