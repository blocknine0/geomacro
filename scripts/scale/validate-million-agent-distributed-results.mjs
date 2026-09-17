import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const PROFILES = {
  million_burst_40k: { expectedAgents: 1_000_000, expectedShards: 40, expectedRate: 40_000, expectedDuration: 25 },
  soak_40k_5m: { expectedAgents: 12_000_000, expectedShards: 40, expectedRate: 40_000, expectedDuration: 300 },
};
const DEFAULT_MAX_P95_MS = 1_500;
const DEFAULT_MAX_P99_MS = 3_000;
const DEFAULT_MAX_LAUNCH_SKEW_MS = 2_000;
const SHA_PATTERN = /^[0-9a-f]{40}$/i;

function finite(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${field} must be finite`);
  return number;
}

function nonEmpty(value, field) {
  const string = String(value || '').trim();
  if (!string) throw new Error(`${field} must be non-empty`);
  return string;
}

function fullSha(value, field) {
  const sha = nonEmpty(value, field).toLowerCase();
  if (!SHA_PATTERN.test(sha)) throw new Error(`${field} must be a full 40-character git SHA`);
  return sha;
}

export function validateSummaries(summaries, options = {}) {
  const profile = options.profile || 'million_burst_40k';
  const canonical = PROFILES[profile];
  if (!canonical) throw new Error(`Unknown 40k validation profile: ${profile}`);
  const expectedAgents = options.expectedAgents ?? canonical.expectedAgents;
  const expectedShards = options.expectedShards ?? canonical.expectedShards;
  const expectedRate = options.expectedRate ?? canonical.expectedRate;
  const expectedDuration = options.expectedDuration ?? canonical.expectedDuration;
  const maxP95Ms = options.maxP95Ms ?? DEFAULT_MAX_P95_MS;
  const maxP99Ms = options.maxP99Ms ?? DEFAULT_MAX_P99_MS;
  const maxLaunchSkewMs = options.maxLaunchSkewMs ?? DEFAULT_MAX_LAUNCH_SKEW_MS;
  const expectedCandidateSha = options.expectedCandidateSha ? fullSha(options.expectedCandidateSha, 'expectedCandidateSha') : null;
  const expectedDeploymentId = options.expectedDeploymentId ? nonEmpty(options.expectedDeploymentId, 'expectedDeploymentId') : null;
  const expectedRunGroupId = options.expectedRunGroupId ? nonEmpty(options.expectedRunGroupId, 'expectedRunGroupId') : null;

  if (!Array.isArray(summaries) || summaries.length !== expectedShards) {
    throw new Error(`Expected exactly ${expectedShards} shard summaries`);
  }

  const indexes = new Set();
  const generatorIds = new Set();
  let totalRequests = 0;
  let totalExpected = 0;
  let worstP95 = 0;
  let worstP99 = 0;
  let minClientCount = Infinity;
  let candidateSha = null;
  let deploymentId = null;
  let runGroupId = null;
  let targetHost = null;
  let barrierEpochMs = null;
  let minLaunchEpochMs = Infinity;
  let maxLaunchEpochMs = -Infinity;

  for (const summary of summaries) {
    if (summary?.suite !== 'geomacro-distributed-40k-load-v3' || summary.profile !== profile) {
      throw new Error('Unexpected distributed 40k load suite/profile');
    }
    if (summary.production_target !== false || summary.execution_authorized !== false) {
      throw new Error('Distributed load summary violated production/execution boundary');
    }
    if (summary.auth_and_abuse_controls_bypassed !== false || summary.capacity_and_quota_acknowledged !== true) {
      throw new Error('Authentication/abuse controls or capacity acknowledgement boundary violated');
    }

    const shardCandidateSha = fullSha(summary.candidate_sha, 'candidate_sha');
    const verifiedStagingSha = fullSha(summary.verified_staging_sha, 'verified_staging_sha');
    if (verifiedStagingSha !== shardCandidateSha) throw new Error('Shard staging SHA is not bound to candidate SHA');
    if (candidateSha === null) candidateSha = shardCandidateSha;
    if (shardCandidateSha !== candidateSha) throw new Error('Shard candidate SHA mismatch');
    if (expectedCandidateSha && shardCandidateSha !== expectedCandidateSha) throw new Error('Candidate SHA does not match expected release');

    const shardDeploymentId = nonEmpty(summary.deployment_id, 'deployment_id');
    if (deploymentId === null) deploymentId = shardDeploymentId;
    if (shardDeploymentId !== deploymentId) throw new Error('Shard deployment ID mismatch');
    if (expectedDeploymentId && shardDeploymentId !== expectedDeploymentId) throw new Error('Deployment ID does not match expected deployment');

    const shardRunGroupId = nonEmpty(summary.run_group_id, 'run_group_id');
    if (runGroupId === null) runGroupId = shardRunGroupId;
    if (shardRunGroupId !== runGroupId) throw new Error('Shard run-group ID mismatch');
    if (expectedRunGroupId && shardRunGroupId !== expectedRunGroupId) throw new Error('Run-group ID does not match expected run');

    const generatorId = nonEmpty(summary.generator_id, 'generator_id');
    if (generatorIds.has(generatorId)) throw new Error(`Duplicate generator ID ${generatorId}`);
    generatorIds.add(generatorId);

    const shardTargetHost = nonEmpty(summary.target_host, 'target_host').toLowerCase();
    if (targetHost === null) targetHost = shardTargetHost;
    if (shardTargetHost !== targetHost) throw new Error('Shard target host mismatch');

    const shardBarrier = finite(summary.orchestrator_barrier_epoch_ms, 'orchestrator_barrier_epoch_ms');
    const launchEpoch = finite(summary.generator_launch_epoch_ms, 'generator_launch_epoch_ms');
    const reportedOffset = finite(summary.generator_launch_offset_ms, 'generator_launch_offset_ms');
    if (!Number.isSafeInteger(shardBarrier) || !Number.isSafeInteger(launchEpoch)) throw new Error('Barrier/launch epoch must be safe integers');
    if (barrierEpochMs === null) barrierEpochMs = shardBarrier;
    if (shardBarrier !== barrierEpochMs) throw new Error('Shard barrier timestamp mismatch');
    const computedOffset = launchEpoch - shardBarrier;
    if (reportedOffset !== computedOffset || computedOffset < 0 || computedOffset > maxLaunchSkewMs) {
      throw new Error(`Generator launch offset ${computedOffset}ms violates synchronized barrier tolerance`);
    }
    minLaunchEpochMs = Math.min(minLaunchEpochMs, launchEpoch);
    maxLaunchEpochMs = Math.max(maxLaunchEpochMs, launchEpoch);

    if (finite(summary.aggregate_rate_per_second, 'aggregate_rate_per_second') !== expectedRate) {
      throw new Error('Shard reports unexpected aggregate request rate');
    }
    if (finite(summary.duration_seconds, 'duration_seconds') !== expectedDuration) {
      throw new Error('Shard reports unexpected duration');
    }

    const clientCount = finite(summary.api_client_count, 'api_client_count');
    const maxRatePerClient = finite(summary.declared_max_rate_per_client, 'declared_max_rate_per_client');
    if (!Number.isInteger(clientCount) || clientCount < Math.ceil(expectedRate / maxRatePerClient)) {
      throw new Error('API client pool does not preserve declared normal per-client rate controls');
    }
    minClientCount = Math.min(minClientCount, clientCount);

    const index = finite(summary.shard_index, 'shard_index');
    if (!Number.isInteger(index) || index < 0 || index >= expectedShards || indexes.has(index)) {
      throw new Error(`Invalid or duplicate shard index ${index}`);
    }
    indexes.add(index);
    if (finite(summary.shard_count, `shard ${index}.shard_count`) !== expectedShards) {
      throw new Error(`Shard ${index} reports unexpected shard count`);
    }

    const expected = finite(summary.expected_request_budget, `shard ${index}.expected_request_budget`);
    const actual = finite(summary.metrics?.http_reqs, `shard ${index}.metrics.http_reqs`);
    if (actual !== expected) throw new Error(`Shard ${index} did not execute its exact request budget`);
    totalExpected += expected;
    totalRequests += actual;

    const requiredZero = [
      'dropped_iterations',
      'response_security_violations',
      'execution_boundary_violations',
      'unexpected_status',
      'non_json_responses',
      'response_header_violations',
      'oversized_responses',
    ];
    for (const field of requiredZero) {
      if (finite(summary.metrics?.[field], `shard ${index}.metrics.${field}`) !== 0) {
        throw new Error(`Shard ${index} failed zero-error gate: ${field}`);
      }
    }
    if (finite(summary.metrics?.http_req_failed_rate, `shard ${index}.metrics.http_req_failed_rate`) !== 0) {
      throw new Error(`Shard ${index} has failed HTTP requests`);
    }

    const p95 = finite(summary.metrics?.http_req_duration_p95_ms, `shard ${index}.p95`);
    const p99 = finite(summary.metrics?.http_req_duration_p99_ms, `shard ${index}.p99`);
    if (p95 >= maxP95Ms) throw new Error(`Shard ${index} p95 ${p95}ms does not meet < ${maxP95Ms}ms`);
    if (p99 >= maxP99Ms) throw new Error(`Shard ${index} p99 ${p99}ms does not meet < ${maxP99Ms}ms`);
    worstP95 = Math.max(worstP95, p95);
    worstP99 = Math.max(worstP99, p99);
  }

  if (indexes.size !== expectedShards || generatorIds.size !== expectedShards) throw new Error('Shard/generator coverage is incomplete');
  const launchSkewMs = maxLaunchEpochMs - minLaunchEpochMs;
  if (launchSkewMs > maxLaunchSkewMs) throw new Error(`Generator launch skew ${launchSkewMs}ms exceeds ${maxLaunchSkewMs}ms`);
  if (totalExpected !== expectedAgents || totalRequests !== expectedAgents) {
    throw new Error(`Expected exactly ${expectedAgents} total agents/requests, got ${totalRequests}`);
  }

  return {
    suite: 'geomacro-distributed-40k-load-validation-v3',
    profile,
    candidate_sha: candidateSha,
    verified_staging_sha: candidateSha,
    deployment_id: deploymentId,
    run_group_id: runGroupId,
    target_host: targetHost,
    orchestrator_barrier_epoch_ms: barrierEpochMs,
    maximum_generator_launch_skew_ms: launchSkewMs,
    generator_count: generatorIds.size,
    distinct_synthetic_agents: expectedAgents,
    total_requests: totalRequests,
    aggregate_rate_per_second: expectedRate,
    duration_seconds: expectedDuration,
    shard_count: expectedShards,
    minimum_api_client_pool_seen: minClientCount,
    auth_and_abuse_controls_bypassed: false,
    all_shards_exact_budget: true,
    synchronized_generator_barrier: true,
    zero_failed_http_requests: true,
    zero_dropped_iterations: true,
    zero_response_security_violations: true,
    zero_execution_boundary_violations: true,
    zero_response_header_violations: true,
    zero_oversized_responses: true,
    worst_shard_latency_ms: { p95: worstP95, p99: worstP99 },
    latency_objective_ms: { p95_max_exclusive: maxP95Ms, p99_max_exclusive: maxP99Ms },
    production_load: false,
    real_payment: false,
    mainnet_activation: false,
    pass: true,
    limitation: 'This proves the tested 40,000 requests/second isolated-staging arrival profile on the recorded release/deployment, not 40,000 simultaneous open connections or unlimited production capacity.',
  };
}

function syntheticSummary(index, profile) {
  const config = PROFILES[profile];
  const expectedPerShard = config.expectedAgents / config.expectedShards;
  const barrier = 1_800_000_000_000;
  const candidateSha = 'a'.repeat(40);
  return {
    suite: 'geomacro-distributed-40k-load-v3',
    profile,
    candidate_sha: candidateSha,
    verified_staging_sha: candidateSha,
    deployment_id: 'staging-deployment-123',
    run_group_id: `self-test-${profile}`,
    generator_id: `generator-${index}`,
    orchestrator_barrier_epoch_ms: barrier,
    generator_launch_epoch_ms: barrier + index,
    generator_launch_offset_ms: index,
    shard_index: index,
    shard_count: config.expectedShards,
    expected_request_budget: expectedPerShard,
    aggregate_rate_per_second: config.expectedRate,
    duration_seconds: config.expectedDuration,
    api_client_count: 400,
    declared_max_rate_per_client: 100,
    target_host: 'isolated-staging.example.test',
    production_target: false,
    execution_authorized: false,
    auth_and_abuse_controls_bypassed: false,
    capacity_and_quota_acknowledged: true,
    metrics: {
      http_reqs: expectedPerShard,
      http_req_duration_p95_ms: 700,
      http_req_duration_p99_ms: 1200,
      http_req_failed_rate: 0,
      dropped_iterations: 0,
      response_security_violations: 0,
      execution_boundary_violations: 0,
      unexpected_status: 0,
      non_json_responses: 0,
      response_header_violations: 0,
      oversized_responses: 0,
    },
  };
}

export function runSelfTest() {
  for (const profile of Object.keys(PROFILES)) {
    const summaries = Array.from({ length: 40 }, (_, index) => syntheticSummary(index, profile));
    const evidence = validateSummaries(summaries, {
      profile,
      expectedCandidateSha: 'a'.repeat(40),
      expectedDeploymentId: 'staging-deployment-123',
      expectedRunGroupId: `self-test-${profile}`,
    });
    if (evidence.aggregate_rate_per_second !== 40_000 || evidence.pass !== true || evidence.generator_count !== 40) {
      throw new Error(`40k result validator happy-path failed for ${profile}`);
    }

    for (const mutation of [
      (items) => { items[0].metrics.response_security_violations = 1; },
      (items) => { items[0].metrics.response_header_violations = 1; },
      (items) => { items[0].metrics.oversized_responses = 1; },
      (items) => { items[0].metrics.http_reqs -= 1; },
      (items) => { items[0].metrics.http_req_duration_p99_ms = 3000; },
      (items) => { items[1].shard_index = 0; },
      (items) => { items[0].production_target = true; },
      (items) => { items[0].auth_and_abuse_controls_bypassed = true; },
      (items) => { items[0].api_client_count = 399; },
      (items) => { items[0].candidate_sha = 'b'.repeat(40); },
      (items) => { items[0].verified_staging_sha = 'b'.repeat(40); },
      (items) => { items[0].deployment_id = 'other-deployment'; },
      (items) => { items[0].run_group_id = 'other-run'; },
      (items) => { items[1].generator_id = items[0].generator_id; },
      (items) => { items[0].target_host = 'other-staging.example.test'; },
      (items) => { items[0].orchestrator_barrier_epoch_ms += 1; },
      (items) => { items[39].generator_launch_epoch_ms += 3000; items[39].generator_launch_offset_ms += 3000; },
    ]) {
      const candidate = structuredClone(summaries);
      mutation(candidate);
      let rejected = false;
      try {
        validateSummaries(candidate, { profile });
      } catch {
        rejected = true;
      }
      if (!rejected) throw new Error(`Validator self-test expected mutated ${profile} evidence to fail`);
    }
  }
  console.log('PASS: synchronized same-release 40k distributed result validator self-test');
}

if (process.argv.includes('--self-test')) {
  runSelfTest();
} else {
  const profile = process.env.RISK_GATE_DISTRIBUTED_PROFILE?.trim() || 'million_burst_40k';
  if (!PROFILES[profile]) throw new Error(`Unknown 40k validation profile: ${profile}`);
  const directory = process.env.RISK_GATE_DISTRIBUTED_RESULTS_DIR?.trim() || `artifacts/distributed-${profile}`;
  const escaped = profile.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matcher = new RegExp(`^distributed-40k-${escaped}-shard-(\\d+)\\.json$`);
  const files = fs.readdirSync(directory)
    .filter((name) => matcher.test(name))
    .sort((a, b) => Number(a.match(/shard-(\d+)/)?.[1]) - Number(b.match(/shard-(\d+)/)?.[1]));
  const summaries = files.map((name) => JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8')));
  const evidence = validateSummaries(summaries, {
    profile,
    expectedCandidateSha: process.env.RISK_GATE_DISTRIBUTED_EXPECTED_CANDIDATE_SHA,
    expectedDeploymentId: process.env.RISK_GATE_DISTRIBUTED_EXPECTED_DEPLOYMENT_ID,
    expectedRunGroupId: process.env.RISK_GATE_DISTRIBUTED_EXPECTED_RUN_GROUP_ID,
  });
  fs.mkdirSync('artifacts', { recursive: true });
  fs.writeFileSync(`artifacts/distributed-40k-validation-${profile}.json`, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(evidence, null, 2));
}
