import fs from 'node:fs';
import process from 'node:process';

function required(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function fullSha(value, field) {
  const sha = String(value || '').trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error(`${field} must be a full 40-character SHA`);
  return sha;
}

function finite(value, field) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`${field} must be finite`);
  return n;
}

function zero(value, field) {
  const n = finite(value, field);
  if (n !== 0) throw new Error(`${field} must be zero, got ${n}`);
  return n;
}

function ratio(value, max, field) {
  const n = finite(value, field);
  if (n < 0 || n > max) throw new Error(`${field} ${n} exceeds <= ${max}`);
  return n;
}

export function validateTelemetry(evidence, options = {}) {
  if (evidence?.schema_version !== 'geomacro.distributed-40k-infra-telemetry.v1') {
    throw new Error('infrastructure telemetry schema mismatch');
  }
  const candidateSha = fullSha(evidence.candidate_sha, 'candidate_sha');
  const expectedSha = options.expectedCandidateSha ? fullSha(options.expectedCandidateSha, 'expectedCandidateSha') : candidateSha;
  if (candidateSha !== expectedSha) throw new Error('telemetry candidate SHA mismatch');
  const deploymentId = String(evidence.deployment_id || '').trim();
  if (!deploymentId) throw new Error('telemetry deployment_id is required');
  if (options.expectedDeploymentId && deploymentId !== options.expectedDeploymentId) throw new Error('telemetry deployment ID mismatch');
  const targetHost = String(evidence.target_host || '').trim().toLowerCase();
  if (!targetHost || ['geomacro.live', 'www.geomacro.live'].includes(targetHost)) throw new Error('telemetry target must be isolated staging');

  const burstRunGroupId = String(evidence.burst_run_group_id || '').trim();
  const soakRunGroupId = String(evidence.soak_run_group_id || '').trim();
  if (!burstRunGroupId || !soakRunGroupId || burstRunGroupId === soakRunGroupId) throw new Error('distinct burst and soak run-group IDs are required');
  if (options.expectedBurstRunGroupId && burstRunGroupId !== options.expectedBurstRunGroupId) throw new Error('burst run-group telemetry mismatch');
  if (options.expectedSoakRunGroupId && soakRunGroupId !== options.expectedSoakRunGroupId) throw new Error('soak run-group telemetry mismatch');

  for (const surface of ['db_pool', 'edge_runtime', 'auth_rate_limit', 'upstream_providers']) {
    if (evidence?.observation_coverage?.[surface] !== true) throw new Error(`telemetry coverage missing: ${surface}`);
  }

  const db = evidence.db_pool || {};
  ratio(db.peak_utilization_ratio, 0.85, 'db_pool.peak_utilization_ratio');
  const waitP95 = finite(db.wait_p95_ms, 'db_pool.wait_p95_ms');
  if (waitP95 < 0 || waitP95 >= 250) throw new Error(`db_pool.wait_p95_ms must be < 250, got ${waitP95}`);
  zero(db.connection_errors, 'db_pool.connection_errors');
  zero(db.exhausted_events, 'db_pool.exhausted_events');

  const edge = evidence.edge_runtime || {};
  ratio(edge.cpu_peak_ratio, 0.90, 'edge_runtime.cpu_peak_ratio');
  ratio(edge.memory_peak_ratio, 0.90, 'edge_runtime.memory_peak_ratio');
  zero(edge.saturation_events, 'edge_runtime.saturation_events');
  zero(edge.runtime_errors, 'edge_runtime.runtime_errors');

  const auth = evidence.auth_rate_limit || {};
  zero(auth.unexpected_auth_failures, 'auth_rate_limit.unexpected_auth_failures');
  zero(auth.unexpected_rate_limits, 'auth_rate_limit.unexpected_rate_limits');
  zero(auth.bypass_events, 'auth_rate_limit.bypass_events');

  const provider = evidence.upstream_providers || {};
  zero(provider.saturation_events, 'upstream_providers.saturation_events');
  zero(provider.timeouts, 'upstream_providers.timeouts');
  zero(provider.errors, 'upstream_providers.errors');

  const security = evidence.security || {};
  zero(security.data_leak_events, 'security.data_leak_events');

  const replay = evidence.idempotency_replay || {};
  zero(replay.replay_mismatches, 'idempotency_replay.replay_mismatches');
  zero(replay.duplicate_effects, 'idempotency_replay.duplicate_effects');
  if (replay.conflict_probe_pass !== true) throw new Error('idempotency_replay.conflict_probe_pass must be true');

  return {
    schema_version: 'geomacro.distributed-40k-infra-telemetry-validation.v1',
    candidate_sha: candidateSha,
    deployment_id: deploymentId,
    target_host: targetHost,
    burst_run_group_id: burstRunGroupId,
    soak_run_group_id: soakRunGroupId,
    db_pool: { peak_utilization_ratio: Number(db.peak_utilization_ratio), wait_p95_ms: waitP95, connection_errors: 0, exhausted_events: 0 },
    edge_runtime: { cpu_peak_ratio: Number(edge.cpu_peak_ratio), memory_peak_ratio: Number(edge.memory_peak_ratio), saturation_events: 0, runtime_errors: 0 },
    auth_rate_limit: { unexpected_auth_failures: 0, unexpected_rate_limits: 0, bypass_events: 0 },
    upstream_providers: { saturation_events: 0, timeouts: 0, errors: 0 },
    security: { data_leak_events: 0 },
    idempotency_replay: { replay_mismatches: 0, duplicate_effects: 0, conflict_probe_pass: true },
    pass: true,
  };
}

function synthetic() {
  return {
    schema_version: 'geomacro.distributed-40k-infra-telemetry.v1',
    candidate_sha: 'a'.repeat(40),
    deployment_id: 'staging-deployment-123',
    target_host: 'isolated-staging.example.test',
    burst_run_group_id: 'burst-1',
    soak_run_group_id: 'soak-1',
    observation_coverage: { db_pool: true, edge_runtime: true, auth_rate_limit: true, upstream_providers: true },
    db_pool: { peak_utilization_ratio: 0.60, wait_p95_ms: 40, connection_errors: 0, exhausted_events: 0 },
    edge_runtime: { cpu_peak_ratio: 0.55, memory_peak_ratio: 0.52, saturation_events: 0, runtime_errors: 0 },
    auth_rate_limit: { unexpected_auth_failures: 0, unexpected_rate_limits: 0, bypass_events: 0 },
    upstream_providers: { saturation_events: 0, timeouts: 0, errors: 0 },
    security: { data_leak_events: 0 },
    idempotency_replay: { replay_mismatches: 0, duplicate_effects: 0, conflict_probe_pass: true },
  };
}

export function runSelfTest() {
  const base = synthetic();
  const pass = validateTelemetry(base, { expectedCandidateSha: 'a'.repeat(40), expectedDeploymentId: 'staging-deployment-123', expectedBurstRunGroupId: 'burst-1', expectedSoakRunGroupId: 'soak-1' });
  if (pass.pass !== true) throw new Error('telemetry happy-path self-test failed');
  for (const mutate of [
    (x) => { x.db_pool.peak_utilization_ratio = 0.86; },
    (x) => { x.db_pool.wait_p95_ms = 250; },
    (x) => { x.db_pool.connection_errors = 1; },
    (x) => { x.edge_runtime.cpu_peak_ratio = 0.91; },
    (x) => { x.edge_runtime.saturation_events = 1; },
    (x) => { x.auth_rate_limit.unexpected_rate_limits = 1; },
    (x) => { x.upstream_providers.timeouts = 1; },
    (x) => { x.security.data_leak_events = 1; },
    (x) => { x.idempotency_replay.duplicate_effects = 1; },
    (x) => { x.idempotency_replay.conflict_probe_pass = false; },
    (x) => { x.observation_coverage.db_pool = false; },
    (x) => { x.candidate_sha = 'b'.repeat(40); },
  ]) {
    const candidate = structuredClone(base);
    mutate(candidate);
    let rejected = false;
    try { validateTelemetry(candidate, { expectedCandidateSha: 'a'.repeat(40), expectedDeploymentId: 'staging-deployment-123', expectedBurstRunGroupId: 'burst-1', expectedSoakRunGroupId: 'soak-1' }); } catch { rejected = true; }
    if (!rejected) throw new Error('telemetry validator self-test expected mutation to fail');
  }
  console.log('PASS: distributed 40k infrastructure telemetry validator self-test');
}

if (process.argv.includes('--self-test')) {
  runSelfTest();
} else {
  const inputPath = required('RISK_GATE_DISTRIBUTED_TELEMETRY_PATH');
  const evidence = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const validated = validateTelemetry(evidence, {
    expectedCandidateSha: process.env.RISK_GATE_DISTRIBUTED_EXPECTED_CANDIDATE_SHA,
    expectedDeploymentId: process.env.RISK_GATE_DISTRIBUTED_EXPECTED_DEPLOYMENT_ID,
    expectedBurstRunGroupId: process.env.RISK_GATE_DISTRIBUTED_EXPECTED_BURST_RUN_GROUP_ID,
    expectedSoakRunGroupId: process.env.RISK_GATE_DISTRIBUTED_EXPECTED_SOAK_RUN_GROUP_ID,
  });
  fs.mkdirSync('artifacts', { recursive: true });
  fs.writeFileSync('artifacts/distributed-40k-infra-telemetry-validation.json', `${JSON.stringify(validated, null, 2)}\n`);
  console.log(JSON.stringify(validated, null, 2));
}