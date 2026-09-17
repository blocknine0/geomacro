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
  const headers = { 'content-type': 'application/json', accept: 'application/json', 'user-agent': 'GeomacroCapacityControlPlane/1.1' };
  if (authorization) headers.authorization = authorization;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(requestBody),
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
  });
  const raw = await response.text();
  let json = null;
  try { json = JSON.parse(raw); } catch { /* caller enforces JSON where required */ }
  return { response, raw, json };
}

function requireSecureHeaders(response, label) {
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  const cacheControl = String(response.headers.get('cache-control') || '').toLowerCase();
  const nosniff = String(response.headers.get('x-content-type-options') || '').toLowerCase();
  if (!contentType.includes('application/json')) throw new Error(`${label} missing JSON content type`);
  if (!cacheControl.includes('no-store')) throw new Error(`${label} missing Cache-Control: no-store`);
  if (response.headers.get('set-cookie')) throw new Error(`${label} unexpectedly set a cookie`);
  if (nosniff !== 'nosniff') throw new Error(`${label} missing X-Content-Type-Options: nosniff`);
}

const base = parseTarget();
const endpoint = new URL('/api/risk-gate', base);
const candidateSha = fullSha(required('RISK_GATE_DISTRIBUTED_CANDIDATE_SHA'), 'RISK_GATE_DISTRIBUTED_CANDIDATE_SHA');
const deploymentId = required('RISK_GATE_DISTRIBUTED_DEPLOYMENT_ID');
const apiKey = parseFirstKey();

const markerResponse = await fetch(new URL('/.well-known/geomacro-build.json', base), {
  headers: { accept: 'application/json', 'cache-control': 'no-cache', 'user-agent': 'GeomacroCapacityControlPlane/1.1' },
  redirect: 'error',
  signal: AbortSignal.timeout(10_000),
});
if (markerResponse.status !== 200) throw new Error(`staging build marker HTTP ${markerResponse.status}`);
const marker = await markerResponse.json();
if (marker?.schema_version !== 'geomacro.deployment-build.v1') throw new Error('staging build marker schema mismatch');
if (marker?.canonical_repository !== 'blocknine0/geomacro') throw new Error('staging build marker repository mismatch');
if (marker?.production_activation_performed !== false) throw new Error('staging build marker unexpectedly authorizes production activation');
if (String(marker?.canonical_main_sha || '').toLowerCase() !== candidateSha) throw new Error('staging SHA changed before post-load control-plane proof');

const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const unauth = await call(endpoint, body(`capacity-auth-${suffix}`), null);
if (![401, 403].includes(unauth.response.status)) throw new Error(`missing-auth request expected 401/403, got ${unauth.response.status}`);
requireSecureHeaders(unauth.response, 'missing-auth response');

const badAuth = await call(endpoint, body(`capacity-badauth-${suffix}`), `Bearer invalid-${'x'.repeat(48)}`);
if (![401, 403].includes(badAuth.response.status)) throw new Error(`invalid-auth request expected 401/403, got ${badAuth.response.status}`);
requireSecureHeaders(badAuth.response, 'invalid-auth response');

const requestId = `capacity-replay-${suffix}`;
const originalBody = body(requestId, 35);
const first = await call(endpoint, originalBody, `Bearer ${apiKey}`);
if (first.response.status !== 200 || first.json?.ok !== true || first.json?.risk_gate?.execution_authorized !== false) {
  throw new Error(`authenticated control request failed: HTTP ${first.response.status}`);
}
requireSecureHeaders(first.response, 'authenticated response');
const auditId = String(first.json?.audit_id || '').trim();
if (!auditId) throw new Error('authenticated control request did not return audit_id');

const replay = await call(endpoint, originalBody, `Bearer ${apiKey}`);
if (replay.response.status !== 200 || replay.json?.ok !== true || replay.json?.risk_gate?.execution_authorized !== false) {
  throw new Error(`exact replay failed: HTTP ${replay.response.status}`);
}
requireSecureHeaders(replay.response, 'exact replay response');
if (String(replay.json?.audit_id || '') !== auditId) throw new Error('exact replay returned a different audit_id');
if (String(replay.response.headers.get('x-geomacro-idempotent-replay') || '').toLowerCase() !== 'true') {
  throw new Error('exact replay did not carry X-Geomacro-Idempotent-Replay: true');
}

const conflict = await call(endpoint, body(requestId, 34), `Bearer ${apiKey}`);
if (conflict.response.status !== 409 || conflict.json?.ok !== false || conflict.json?.error?.code !== 'IDEMPOTENCY_CONFLICT') {
  throw new Error(`mutated replay did not fail closed with IDEMPOTENCY_CONFLICT: HTTP ${conflict.response.status}`);
}
requireSecureHeaders(conflict.response, 'mutated replay response');
if (conflict.json?.execution_authorized !== false) throw new Error('mutated replay conflict did not preserve execution_authorized=false');

for (const [label, raw] of [['authenticated', first.raw], ['replay', replay.raw], ['conflict', conflict.raw]]) {
  if (raw.includes(apiKey)) throw new Error(`${label} response echoed the staging API key`);
}

const evidence = {
  schema_version: 'geomacro.distributed-capacity-control-plane.v2',
  generated_at: new Date().toISOString(),
  candidate_sha: candidateSha,
  verified_staging_sha: candidateSha,
  operator_deployment_id: deploymentId,
  target_host: base.host,
  missing_auth_rejected: true,
  invalid_auth_rejected: true,
  authenticated_request_http_200: true,
  exact_replay_http_200: true,
  exact_replay_same_audit_id: true,
  exact_replay_marker: true,
  mutated_replay_http_409: true,
  mutated_replay_error_code: 'IDEMPOTENCY_CONFLICT',
  secure_response_headers_preserved: true,
  execution_authorized: false,
  api_key_echoed: false,
  production_target: false,
  real_payment: false,
  mainnet_activation: false,
  pass: true,
};
fs.mkdirSync('artifacts', { recursive: true });
fs.writeFileSync('artifacts/distributed-40k-control-plane-proof.json', `${JSON.stringify(evidence, null, 2)}\n`);
console.log('PASS: post-load staging auth, replay/idempotency, response-security, and execution boundaries verified.');
