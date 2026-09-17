import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const PROFILES = {
  million_burst_40k: { expectedAgents: 1_000_000, expectedShards: 40, expectedRate: 40_000, expectedDuration: 25 },
  soak_40k_5m: { expectedAgents: 12_000_000, expectedShards: 40, expectedRate: 40_000, expectedDuration: 300 },
};
const DEFAULT_MAX_P95_MS = 1_500;
const DEFAULT_MAX_P99_MS = 3_000;

function finite(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${field} must be finite`);
  return number;
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

  if (!Array.isArray(summaries) || summaries.length !== expectedShards) {
    throw new Error(`Expected exactly ${expectedShards} shard summaries`);
  }

  const indexes = new Set();
  let totalRequests = 0;
  let totalExpected = 0;
  let worstP95 = 0;
  let worstP99 = 0;
  let minClientCount = Infinity;

  for (const summary of summaries) {
    if (summary?.suite !== 'geomacro-distributed-40k-load-v2' || summary.profile !== profile) {
      throw new Error('Unexpected distributed 40k load suite/profile');
    }
    if (summary.production_target !== false || summary.execution_authorized !== false) {
      throw new Error('Distributed load summary violated production/execution boundary');
    }
    if (summary.auth_and_abuse_controls_bypassed !== false || summary.capacity_and_quota_acknowledged !== true) {
      throw new Error('Authentication/abuse controls or capacity acknowledgement boundary violated');
    }
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

  if (indexes.size !== expectedShards) throw new Error('Shard index coverage is incomplete');
  if (totalExpected !== expectedAgents || totalRequests !== expectedAgents) {
    throw new Error(`Expected exactly ${expectedAgents} total agents/requests, got ${totalRequests}`);
  }

  return {
    suite: 'geomacro-distributed-40k-load-validation-v2',
    profile,
    distinct_synthetic_agents: expectedAgents,
    total_requests: totalRequests,
    aggregate_rate_per_second: expectedRate,
    duration_seconds: expectedDuration,
    shard_count: expectedShards,
    minimum_api_client_pool_seen: minClientCount,
    auth_and_abuse_controls_bypassed: false,
    all_shards_exact_budget: true,
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
    limitation: 'This proves the tested 40,000 requests/second isolated-staging arrival profile, not 40,000 simultaneous open connections or unlimited production capacity.',
  };
}

function syntheticSummary(index, profile) {
  const config = PROFILES[profile];
  const expectedPerShard = config.expectedAgents / config.expectedShards;
  return {
    suite: 'geomacro-distributed-40k-load-v2',
    profile,
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
    const evidence = validateSummaries(summaries, { profile });
    if (evidence.aggregate_rate_per_second !== 40_000 || evidence.pass !== true) {
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
  console.log('PASS: 40k distributed result validator self-test');
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
  const evidence = validateSummaries(summaries, { profile });
  fs.mkdirSync('artifacts', { recursive: true });
  fs.writeFileSync(`artifacts/distributed-40k-validation-${profile}.json`, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(evidence, null, 2));
}
