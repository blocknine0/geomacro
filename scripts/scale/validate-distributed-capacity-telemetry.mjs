import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
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

function safeEpoch(value, field) {
  const n = finite(value, field);
  if (!Number.isSafeInteger(n) || n < 1_600_000_000_000 || n > 4_000_000_000_000) {
    throw new Error(`${field} must be a valid millisecond epoch`);
  }
  return n;
}

function positiveInteger(value, field) {
  const n = finite(value, field);
  if (!Number.isInteger(n) || n < 1) throw new Error(`${field} must be a positive integer`);
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

function iso(value, field) {
  const raw = String(value || '').trim();
  const ms = Date.parse(raw);
  if (!raw || !Number.isFinite(ms)) throw new Error(`${field} must be an ISO timestamp`);
  return { raw, ms };
}

function validateWindow(window, label, expectedStartMs, expectedDurationSeconds) {
  if (window?.full_window_covered !== true) throw new Error(`${label}.full_window_covered must be true`);
  const start = iso(window.started_at, `${label}.started_at`);
  const end = iso(window.ended_at, `${label}.ended_at`);
  if (end.ms <= start.ms) throw new Error(`${label} ended_at must be after started_at`);
  const samples = positiveInteger(window.sample_count, `${label}.sample_count`);
  const maxGapMs = positiveInteger(window.max_sample_gap_ms, `${label}.max_sample_gap_ms`);
  if (maxGapMs > 5_000) throw new Error(`${label}.max_sample_gap_ms must be <= 5000, got ${maxGapMs}`);

  if (expectedStartMs != null) {
    const expectedStart = safeEpoch(expectedStartMs, `${label}.expected_start_ms`);
    const duration = positiveInteger(expectedDurationSeconds, `${label}.expected_duration_seconds`);
    const expectedEnd = expectedStart + duration * 1000;
    if (start.ms > expectedStart) throw new Error(`${label} starts after the load barrier and does not cover the full load window`);
    if (end.ms < expectedEnd) throw new Error(`${label} ends before the load window completes`);
    const minimumSamples = Math.ceil((duration * 1000) / maxGapMs) + 1;
    if (samples < minimumSamples) {
      throw new Error(`${label}.sample_count ${samples} is insufficient for ${duration}s with max gap ${maxGapMs}ms; need >= ${minimumSamples}`);
    }
  }

  return {
    started_at: start.raw,
    ended_at: end.raw,
    sample_count: samples,
    max_sample_gap_ms: maxGapMs,
    full_window_covered: true,
  };
}

function validateProviderPathAudit(audit, candidateSha) {
  if (audit?.schema_version !== 'geomacro.risk-gate-provider-path-audit.v1' || audit?.pass !== true) {
    throw new Error('Risk Gate provider-path audit is not PASS');
  }
  if (audit?.candidate_sha !== candidateSha) throw new Error('provider-path audit candidate SHA mismatch');
  if (audit?.external_model_provider_in_synchronous_request_path !== false) {
    throw new Error('external model provider detected in synchronous Risk Gate request path');
  }
  if (audit?.external_model_provider_saturation?.status !== 'not_applicable_to_synchronous_risk_gate_request_path') {
    throw new Error('provider saturation must be explicitly N/A for the audited synchronous Risk Gate path');
  }
  if (audit?.database_dependency_in_request_path !== true) throw new Error('provider-path audit lost database dependency boundary');
  if (audit?.production_load !== false || audit?.payment_or_mainnet_activation !== false) {
    throw new Error('provider-path audit crossed a forbidden production boundary');
  }
  return {
    external_model_provider_in_synchronous_request_path: false,
    saturation_status: 'not_applicable_to_synchronous_risk_gate_request_path',
    database_dependency_in_request_path: true,
    source_bound: true,
  };
}

export function validateTelemetry(evidence, options = {}) {
  if (evidence?.schema_version !== 'geomacro.distributed-40k-infra-telemetry.v3') {
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

  const collector = evidence.collector || {};
  const collectorId = String(collector.collector_id || '').trim();
  const evidenceId = String(collector.evidence_id || '').trim();
  if (!collectorId || !evidenceId || collector.authenticated_query !== true) throw new Error('authenticated telemetry collector identity/evidence ID is required');

  const burstRunGroupId = String(evidence.burst_run_group_id || '').trim();
  const soakRunGroupId = String(evidence.soak_run_group_id || '').trim();
  if (!burstRunGroupId || !soakRunGroupId || burstRunGroupId === soakRunGroupId) throw new Error('distinct burst and soak run-group IDs are required');
  if (options.expectedBurstRunGroupId && burstRunGroupId !== options.expectedBurstRunGroupId) throw new Error('burst run-group telemetry mismatch');
  if (options.expectedSoakRunGroupId && soakRunGroupId !== options.expectedSoakRunGroupId) throw new Error('soak run-group telemetry mismatch');

  const windows = {
    burst: validateWindow(evidence?.observation_windows?.burst, 'observation_windows.burst', options.expectedBurstStartMs, options.expectedBurstDurationSeconds),
    soak: validateWindow(evidence?.observation_windows?.soak, 'observation_windows.soak', options.expectedSoakStartMs, options.expectedSoakDurationSeconds),
  };

  for (const surface of ['db_pool', 'edge_runtime', 'auth_rate_limit', 'security', 'idempotency_replay']) {
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

  const security = evidence.security || {};
  zero(security.data_leak_events, 'security.data_leak_events');

  const replay = evidence.idempotency_replay || {};
  zero(replay.replay_mismatches, 'idempotency_replay.replay_mismatches');
  zero(replay.duplicate_effects, 'idempotency_replay.duplicate_effects');
  if (replay.conflict_probe_pass !== true) throw new Error('idempotency_replay.conflict_probe_pass must be true');

  const providerPath = validateProviderPathAudit(options.providerPathAudit, candidateSha);
  const providerAuditSha256 = createHash('sha256')
    .update(Buffer.from(JSON.stringify(options.providerPathAudit)))
    .digest('hex');

  return {
    schema_version: 'geomacro.distributed-40k-infra-telemetry-validation.v3',
    candidate_sha: candidateSha,
    deployment_id: deploymentId,
    target_host: targetHost,
    collector: { collector_id: collectorId, evidence_id: evidenceId, authenticated_query: true },
    burst_run_group_id: burstRunGroupId,
    soak_run_group_id: soakRunGroupId,
    observation_windows: windows,
    db_pool: { peak_utilization_ratio: Number(db.peak_utilization_ratio), wait_p95_ms: waitP95, connection_errors: 0, exhausted_events: 0 },
    edge_runtime: { cpu_peak_ratio: Number(edge.cpu_peak_ratio), memory_peak_ratio: Number(edge.memory_peak_ratio), saturation_events: 0, runtime_errors: 0 },
    auth_rate_limit: { unexpected_auth_failures: 0, unexpected_rate_limits: 0, bypass_events: 0 },
    security: { data_leak_events: 0 },
    idempotency_replay: { replay_mismatches: 0, duplicate_effects: 0, conflict_probe_pass: true },
    upstream_provider: {
      ...providerPath,
      provider_path_audit_sha256: providerAuditSha256,
    },
    provider_saturation_gate_pass: true,
    provider_saturation_gate_basis: 'not_applicable_source_audited',
    pass: true,
  };
}

function syntheticProviderAudit() {
  return {
    schema_version: 'geomacro.risk-gate-provider-path-audit.v1',
    candidate_sha: 'a'.repeat(40),
    external_model_provider_in_synchronous_request_path: false,
    external_model_provider_saturation: { status: 'not_applicable_to_synchronous_risk_gate_request_path' },
    database_dependency_in_request_path: true,
    production_load: false,
    payment_or_mainnet_activation: false,
    pass: true,
  };
}

function synthetic() {
  return {
    schema_version: 'geomacro.distributed-40k-infra-telemetry.v3',
    candidate_sha: 'a'.repeat(40),
    deployment_id: 'staging-deployment-123',
    target_host: 'isolated-staging.example.test',
    collector: { collector_id: 'staging-observability', evidence_id: 'evidence-123', authenticated_query: true },
    burst_run_group_id: 'burst-1',
    soak_run_group_id: 'soak-1',
    observation_windows: {
      burst: { started_at: '2026-09-17T00:00:00.000Z', ended_at: '2026-09-17T00:00:30.000Z', sample_count: 7, max_sample_gap_ms: 5000, full_window_covered: true },
      soak: { started_at: '2026-09-17T00:02:00.000Z', ended_at: '2026-09-17T00:07:05.000Z', sample_count: 61, max_sample_gap_ms: 5000, full_window_covered: true },
    },
    observation_coverage: { db_pool: true, edge_runtime: true, auth_rate_limit: true, security: true, idempotency_replay: true },
    db_pool: { peak_utilization_ratio: 0.60, wait_p95_ms: 40, connection_errors: 0, exhausted_events: 0 },
    edge_runtime: { cpu_peak_ratio: 0.55, memory_peak_ratio: 0.52, saturation_events: 0, runtime_errors: 0 },
    auth_rate_limit: { unexpected_auth_failures: 0, unexpected_rate_limits: 0, bypass_events: 0 },
    security: { data_leak_events: 0 },
    idempotency_replay: { replay_mismatches: 0, duplicate_effects: 0, conflict_probe_pass: true },
  };
}

export function runSelfTest() {
  const base = synthetic();
  const options = {
    expectedCandidateSha: 'a'.repeat(40),
    expectedDeploymentId: 'staging-deployment-123',
    expectedBurstRunGroupId: 'burst-1',
    expectedSoakRunGroupId: 'soak-1',
    expectedBurstStartMs: Date.parse('2026-09-17T00:00:00.000Z'),
    expectedBurstDurationSeconds: 25,
    expectedSoakStartMs: Date.parse('2026-09-17T00:02:00.000Z'),
    expectedSoakDurationSeconds: 300,
    providerPathAudit: syntheticProviderAudit(),
  };
  const pass = validateTelemetry(base, options);
  if (pass.pass !== true || pass.provider_saturation_gate_basis !== 'not_applicable_source_audited') throw new Error('telemetry happy-path self-test failed');
  for (const mutate of [
    (x) => { x.db_pool.peak_utilization_ratio = 0.86; },
    (x) => { x.db_pool.wait_p95_ms = 250; },
    (x) => { x.db_pool.connection_errors = 1; },
    (x) => { x.edge_runtime.cpu_peak_ratio = 0.91; },
    (x) => { x.edge_runtime.saturation_events = 1; },
    (x) => { x.auth_rate_limit.unexpected_rate_limits = 1; },
    (x) => { x.security.data_leak_events = 1; },
    (x) => { x.idempotency_replay.duplicate_effects = 1; },
    (x) => { x.idempotency_replay.conflict_probe_pass = false; },
    (x) => { x.observation_coverage.db_pool = false; },
    (x) => { x.observation_windows.soak.full_window_covered = false; },
    (x) => { x.observation_windows.burst.started_at = '2026-09-17T00:00:01.000Z'; },
    (x) => { x.observation_windows.soak.ended_at = '2026-09-17T00:06:59.000Z'; },
    (x) => { x.observation_windows.soak.max_sample_gap_ms = 5001; },
    (x) => { x.observation_windows.soak.sample_count = 60; },
    (x) => { x.collector.authenticated_query = false; },
    (x) => { x.candidate_sha = 'b'.repeat(40); },
  ]) {
    const candidate = structuredClone(base);
    mutate(candidate);
    let rejected = false;
    try { validateTelemetry(candidate, options); } catch { rejected = true; }
    if (!rejected) throw new Error('telemetry validator self-test expected mutation to fail');
  }
  const badProvider = syntheticProviderAudit();
  badProvider.external_model_provider_in_synchronous_request_path = true;
  let providerRejected = false;
  try { validateTelemetry(base, { ...options, providerPathAudit: badProvider }); } catch { providerRejected = true; }
  if (!providerRejected) throw new Error('telemetry validator must reject an external provider in synchronous Risk Gate path');
  console.log('PASS: distributed 40k exact-window infrastructure telemetry + provider-path validator self-test');
}

function runProviderPathAudit(candidateSha) {
  const result = spawnSync('node', ['scripts/scale/audit-risk-gate-provider-path.mjs'], {
    encoding: 'utf8',
    env: { ...process.env, RISK_GATE_DISTRIBUTED_CANDIDATE_SHA: candidateSha },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`provider-path audit failed: ${String(result.stderr || result.stdout || '').trim()}`);
  return JSON.parse(fs.readFileSync('artifacts/risk-gate-provider-path-audit.json', 'utf8'));
}

if (process.argv.includes('--self-test')) {
  runSelfTest();
} else {
  const inputPath = required('RISK_GATE_DISTRIBUTED_TELEMETRY_PATH');
  const expectedSha = fullSha(required('RISK_GATE_DISTRIBUTED_EXPECTED_CANDIDATE_SHA'), 'expected candidate SHA');
  const evidence = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const providerPathAudit = runProviderPathAudit(expectedSha);
  const validated = validateTelemetry(evidence, {
    expectedCandidateSha: expectedSha,
    expectedDeploymentId: process.env.RISK_GATE_DISTRIBUTED_EXPECTED_DEPLOYMENT_ID,
    expectedBurstRunGroupId: process.env.RISK_GATE_DISTRIBUTED_EXPECTED_BURST_RUN_GROUP_ID,
    expectedSoakRunGroupId: process.env.RISK_GATE_DISTRIBUTED_EXPECTED_SOAK_RUN_GROUP_ID,
    expectedBurstStartMs: required('BURST_BARRIER_EPOCH_MS'),
    expectedBurstDurationSeconds: 25,
    expectedSoakStartMs: required('SOAK_BARRIER_EPOCH_MS'),
    expectedSoakDurationSeconds: 300,
    providerPathAudit,
  });
  fs.mkdirSync('artifacts', { recursive: true });
  fs.writeFileSync('artifacts/distributed-40k-infra-telemetry-validation.json', `${JSON.stringify(validated, null, 2)}\n`);
  console.log(JSON.stringify(validated, null, 2));
}
