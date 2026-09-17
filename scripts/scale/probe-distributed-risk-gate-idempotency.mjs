import fs from 'node:fs';
import process from 'node:process';

const PRODUCTION_HOSTS = new Set(['geomacro.live', 'www.geomacro.live']);
const SHA = /^[0-9a-f]{40}$/i;

function required(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function validateTarget(raw, expectedHost) {
  const url = new URL(raw);
  if (url.protocol !== 'https:') throw new Error('Idempotency proof target must use HTTPS');
  if (PRODUCTION_HOSTS.has(url.hostname.toLowerCase())) throw new Error('Production Geomacro host is forbidden');
  if (url.username || url.password || url.search || url.hash) throw new Error('Target URL must not contain credentials/query/fragment');
  if (url.host.toLowerCase() !== expectedHost.toLowerCase()) throw new Error('Expected staging host mismatch');
  return url;
}

function parseKeys(raw) {
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed) || parsed.length < 1) throw new Error('API key pool must be a non-empty JSON array');
  const key = String(parsed[0] || '').trim();
  if (key.length < 32 || key.length > 512) throw new Error('Staging API key length is invalid');
  return key;
}

async function verifyBuild(baseUrl, candidateSha) {
  const response = await fetch(new URL('/.well-known/geomacro-build.json', baseUrl), {
    redirect: 'error',
    headers: { accept: 'application/json', 'cache-control': 'no-cache', 'user-agent': 'GeomacroDistributedIdempotencyProof/1.0' },
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status !== 200) throw new Error(`Staging build marker HTTP ${response.status}`);
  const body = await response.json();
  const deployed = String(body?.canonical_main_sha || '').toLowerCase();
  if (body?.schema_version !== 'geomacro.deployment-build.v1') throw new Error('Staging build marker schema mismatch');
  if (body?.canonical_repository !== 'blocknine0/geomacro') throw new Error('Unexpected canonical repository');
  if (body?.production_activation_performed !== false) throw new Error('Staging build marker unexpectedly authorizes production activation');
  if (deployed !== candidateSha) throw new Error(`Staging SHA ${deployed || 'missing'} does not match candidate ${candidateSha}`);
}

function policy(continueMax) {
  return {
    policy_id: 'geomacro-distributed-idempotency-proof',
    policy_version: '1.0.0',
    continue_max_score: continueMax,
    reduce_limit_max_score: 55,
    require_approval_max_score: 75,
    minimum_confidence_for_auto_continue: 0.8,
    require_commercial_verification_for_continue: true,
    max_positive_delta_for_auto_continue: 10,
    hard_stop_driver_contributions: { sanctions: 20 },
  };
}

function body(requestId, continueMax) {
  return {
    request_id: requestId,
    subject: { type: 'country', country_iso3: 'USA' },
    action_context: { action_type: 'distributed_staging_idempotency_proof', currency: 'USDC', metadata: { synthetic: true, load_test: true } },
    policy: policy(continueMax),
  };
}

async function call(endpoint, apiKey, payload) {
  const response = await fetch(endpoint, {
    method: 'POST',
    redirect: 'error',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
      'user-agent': 'GeomacroDistributedIdempotencyProof/1.0',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15_000),
  });
  const raw = await response.text();
  if (raw.includes(apiKey)) throw new Error('API key echoed in response');
  let json;
  try { json = JSON.parse(raw); } catch { throw new Error(`Non-JSON response at HTTP ${response.status}`); }
  return { response, json };
}

function executionFalse(payload) {
  return payload?.execution_authorized === false || payload?.risk_gate?.execution_authorized === false;
}

async function run() {
  const candidateSha = required('RISK_GATE_DISTRIBUTED_CANDIDATE_SHA').toLowerCase();
  if (!SHA.test(candidateSha)) throw new Error('Candidate SHA must be full 40-character SHA');
  const deploymentId = required('RISK_GATE_DISTRIBUTED_DEPLOYMENT_ID');
  const runGroupId = required('RISK_GATE_DISTRIBUTED_RUN_GROUP_ID');
  const baseUrl = validateTarget(required('RISK_GATE_DISTRIBUTED_STAGING_BASE_URL'), required('RISK_GATE_DISTRIBUTED_EXPECTED_HOST'));
  const apiKey = parseKeys(required('RISK_GATE_DISTRIBUTED_API_KEYS_JSON'));
  await verifyBuild(baseUrl, candidateSha);

  const endpoint = new URL('/api/risk-gate', baseUrl);
  const requestId = `distributed-idempotency-${runGroupId}-${Date.now()}`;
  const first = await call(endpoint, apiKey, body(requestId, 35));
  if (first.response.status !== 200 || first.json?.ok !== true || !executionFalse(first.json)) throw new Error(`First request failed: HTTP ${first.response.status}`);
  const auditId = String(first.json?.audit_id || '');
  if (!auditId) throw new Error('First request missing audit_id');

  const replay = await call(endpoint, apiKey, body(requestId, 35));
  if (replay.response.status !== 200 || replay.json?.ok !== true || !executionFalse(replay.json)) throw new Error(`Replay failed: HTTP ${replay.response.status}`);
  if (String(replay.json?.audit_id || '') !== auditId) throw new Error('Replay returned a different audit_id');
  if (String(replay.response.headers.get('x-geomacro-idempotent-replay') || '').toLowerCase() !== 'true') throw new Error('Replay marker header missing');

  const conflict = await call(endpoint, apiKey, body(requestId, 34));
  if (conflict.response.status !== 409 || conflict.json?.ok !== false || conflict.json?.error?.code !== 'IDEMPOTENCY_CONFLICT' || !executionFalse(conflict.json)) {
    throw new Error(`Changed-payload replay did not fail closed with IDEMPOTENCY_CONFLICT: HTTP ${conflict.response.status}`);
  }

  const evidence = {
    schema_version: 'geomacro.distributed-risk-gate-idempotency.v1',
    generated_at: new Date().toISOString(),
    candidate_sha: candidateSha,
    verified_staging_sha: candidateSha,
    deployment_id: deploymentId,
    run_group_id: runGroupId,
    target_host: baseUrl.host,
    authenticated_first_request_http: 200,
    exact_replay_http: 200,
    exact_replay_same_audit_id: true,
    replay_marker_header: true,
    changed_payload_conflict_http: 409,
    conflict_error_code: 'IDEMPOTENCY_CONFLICT',
    execution_authorized: false,
    secrets_recorded: false,
    production_target: false,
    real_payment: false,
    mainnet_activation: false,
    pass: true,
  };
  fs.mkdirSync('artifacts', { recursive: true });
  fs.writeFileSync('artifacts/distributed-risk-gate-idempotency.json', `${JSON.stringify(evidence, null, 2)}\n`);
  console.log('PASS: same-release staging Risk Gate success/replay/conflict evidence verified.');
}

if (process.argv.includes('--self-test')) {
  for (const bad of ['https://geomacro.live', 'https://www.geomacro.live']) {
    let blocked = false;
    try { validateTarget(bad, new URL(bad).host); } catch { blocked = true; }
    if (!blocked) throw new Error(`Production target guard failed for ${bad}`);
  }
  console.log('PASS: distributed idempotency probe self-test');
} else {
  run().catch((error) => {
    console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
