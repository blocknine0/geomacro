import fs from 'node:fs';
import process from 'node:process';

const PRODUCTION_HOSTS = new Set(['geomacro.live', 'www.geomacro.live']);

function required(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function fullSha(value, name) {
  const sha = String(value || '').trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error(`${name} must be a full 40-character SHA`);
  return sha;
}

function parseTarget() {
  const base = new URL(required('RISK_GATE_DISTRIBUTED_STAGING_BASE_URL'));
  if (base.protocol !== 'https:') throw new Error('staging target must use HTTPS');
  if (PRODUCTION_HOSTS.has(base.hostname.toLowerCase())) throw new Error('production Geomacro host is forbidden');
  if (base.username || base.password || base.search || base.hash) throw new Error('staging URL must not contain credentials/query/fragment');
  const expectedHost = required('RISK_GATE_DISTRIBUTED_EXPECTED_HOST').toLowerCase();
  if (base.host.toLowerCase() !== expectedHost) throw new Error('staging expected-host mismatch');
  return base;
}

function parseFirstKey() {
  let keys;
  try { keys = JSON.parse(required('RISK_GATE_DISTRIBUTED_API_KEYS_JSON')); } catch { throw new Error('API key pool must be valid JSON'); }
  if (!Array.isArray(keys) || keys.length < 1) throw new Error('API key pool must be non-empty');
  const key = String(keys[0] || '').trim();
  if (key.length < 32 || key.length > 512) throw new Error('first staging API key has invalid length');
  return key;
}

function body(requestId, continueMax = 35) {
  return {
    request_id: requestId,
    subject: { type: 'country', country_iso3: 'USA' },
    action_context: {
      action_type: 'distributed_staging_control_plane_proof',
      currency: 'USDC',
      metadata: { synthetic: true, post_capacity_probe: true },
    },
    policy: {
      policy_id: 'geomacro-distributed-staging-control-plane',
      policy_version: '1.0.0',
      continue_max_score: continueMax,
      reduce_limit_max_score: 55,
      require_approval_max_score: 75,
      minimum_confidence_for_auto_continue: 0.8,
      require_commercial_verification_for_continue: true,
      max_positive_delta_for_auto_continue: 10,
      hard_stop_driver_contributions: { sanctions: 20 },
    },
  };
}

async function call(endpoint, requestBody, authorization) {
  const headers = { 'content-type': 'application/json', accept: 'application/json', 'user-agent': 'GeomacroCapacityControlPlane/1.0' };
  if (authorization) headers.authorization = authorization;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(requestBody),
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
  });
  let json = null;
  try { json = await response.json(); } catch { /* fail below where JSON is required */ }
  return { response, json };
}

const base = parseTarget();
const endpoint = new URL('/api/risk-gate', base);
const candidateSha = fullSha(required('RISK_GATE_DISTRIBUTED_CANDIDATE_SHA'), 'RISK_GATE_DISTRIBUTED_CANDIDATE_SHA');
const deploymentId = required('RISK_GATE_DISTRIBUTED_DEPLOYMENT_ID');
const apiKey = parseFirstKey();

const markerResponse = await fetch(new URL('/.well-known/geomacro-build.json', base), {
  headers: { accept: 'application/json', 'cache-control': 'no-cache', 'user-agent': 'GeomacroCapacityControlPlane/1.0' },
  redirect: 'error',
  signal: AbortSignal.timeout(10_000),
});
if (markerResponse.status !== 200) throw new Error(`staging build marker HTTP ${markerResponse.status}`);
const marker = await markerResponse.json();
if (marker?.schema_version !== 'geomacro.deployment-build.v1') throw new Error('staging build marker schema mismatch');
if (String(marker?.canonical_main_sha || '').toLowerCase() !== candidateSha) throw new Error('staging SHA changed before control-plane proof');

const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const unauthBody = body(`capacity-auth-${suffix}`);
const unauth = await call(endpoint, unauthBody, null);
if (![401, 403].includes(unauth.response.status)) throw new Error(`missing-auth request expected 401/403, got ${unauth.response.status}`);

const badAuth = await call(endpoint, body(`capacity-badauth-${suffix}`), `Bearer invalid-${'x'.repeat(48)}`);
if (![401, 403].includes(badAuth.response.status)) throw new Error(`invalid-auth request expected 401/403, got ${badAuth.response.status}`);

const requestId = `capacity-replay-${suffix}`;
const originalBody = body(requestId, 35);
const first = await call(endpoint, originalBody, `Bearer ${apiKey}`);
if (first.response.status !== 200 || first.json?.ok !== true || first.json?.risk_gate?.execution_authorized !== false) {
  throw new Error(`authenticated control request failed: HTTP ${first.response.status}`);
}
const auditId = String(first.json?.audit_id || '').trim();
if (!auditId) throw new Error('authenticated control request did not return audit_id');

const replay = await call(endpoint, originalBody, `Bearer ${apiKey}`);
if (replay.response.status !== 200 || replay.json?.ok !== true || replay.json?.risk_gate?.execution_authorized !== false) {
  throw new Error(`exact replay failed: HTTP ${replay.response.status}`);
}
if (String(replay.json?.audit_id || '') !== auditId) throw new Error('exact replay returned a different audit_id');
if (String(replay.response.headers.get('x-geomacro-idempotent-replay') || '').toLowerCase() !== 'true') {
  throw new Error('exact replay did not carry X-Geomacro-Idempotent-Replay: true');
}

const conflict = await call(endpoint, body(requestId, 34), `Bearer ${apiKey}`);
if (conflict.response.status !== 409 || conflict.json?.ok !== false || conflict.json?.error?.code !== 'IDEMPOTENCY_CONFLICT') {
  throw new Error(`mutated replay did not fail closed with IDEMPOTENCY_CONFLICT: HTTP ${conflict.response.status}`);
}
if (conflict.json?.execution_authorized !== false) throw new Error('mutated replay conflict did not preserve execution_authorized=false');

const evidence = {
  schema_version: 'geomacro.distributed-capacity-control-plane.v1',
  generated_at: new Date().toISOString(),
  candidate_sha: candidateSha,
  deployment_id: deploymentId,
  target_host: base.host,
  missing_auth_rejected: true,
  invalid_auth_rejected: true,
  authenticated_request_http_200: true,
  exact_replay_http_200: true,
  exact_replay_same_audit_id: true,
  exact_replay_marker: true,
  mutated_replay_http_409: true,
  mutated_replay_error_code: 'IDEMPOTENCY_CONFLICT',
  execution_authorized: false,
  api_key_echoed: false,
  production_target: false,
  real_payment: false,
  mainnet_activation: false,
  pass: true,
};
fs.mkdirSync('artifacts', { recursive: true });
fs.writeFileSync('artifacts/distributed-40k-control-plane-proof.json', `${JSON.stringify(evidence, null, 2)}\n`);
console.log('PASS: staging auth, exact replay, and mutated replay conflict boundaries verified after capacity load.');