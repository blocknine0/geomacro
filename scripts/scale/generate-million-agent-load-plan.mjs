import fs from 'node:fs';
import process from 'node:process';

const PRODUCTION_HOSTS = new Set(['geomacro.live', 'www.geomacro.live']);
const PROFILE_BURST = 'million_burst_40k';
const PROFILE_SOAK = 'soak_40k_5m';
const PROFILES = {
  [PROFILE_BURST]: {
    totalAgents: 1_000_000,
    shards: 40,
    durationSeconds: 25,
    aggregateRate: 40_000,
    preAllocatedVUs: 2_000,
    maxVUs: 6_000,
  },
  [PROFILE_SOAK]: {
    totalAgents: 12_000_000,
    shards: 40,
    durationSeconds: 300,
    aggregateRate: 40_000,
    preAllocatedVUs: 2_000,
    maxVUs: 6_000,
  },
};
const MAX_TOTAL_AGENTS = 12_000_000;
const MAX_SHARDS = 100;
const MAX_AGGREGATE_RATE = 40_000;
const MAX_RESPONSE_BYTES = 262_144;
const P95_MAX_MS = 1_500;
const P99_MAX_MS = 3_000;

function integer(value, fallback, min, max, name) {
  const parsed = value === undefined || value === '' ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer within ${min}..${max}`);
  }
  return parsed;
}

function profileConfig(name) {
  const profile = name || PROFILE_BURST;
  const config = PROFILES[profile];
  if (!config) throw new Error(`Unknown distributed load profile: ${profile}`);
  return { profile, ...config };
}

export function validateStagingUrl(value) {
  if (!value) return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Distributed load target must be a valid URL');
  }
  const hostname = url.hostname.toLowerCase();
  if (PRODUCTION_HOSTS.has(hostname)) {
    throw new Error('Production Geomacro host is forbidden for distributed load');
  }
  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  if (url.protocol !== 'https:' && !isLocal) {
    throw new Error('Distributed staging target must use HTTPS unless localhost');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('Distributed staging URL must not contain credentials, query parameters or fragments');
  }
  return url;
}

export function buildPlan(input = {}) {
  const canonical = profileConfig(input.profile);
  const totalAgents = integer(input.totalAgents, canonical.totalAgents, 1, MAX_TOTAL_AGENTS, 'totalAgents');
  const shards = integer(input.shards, canonical.shards, 1, MAX_SHARDS, 'shards');
  const durationSeconds = integer(input.durationSeconds, canonical.durationSeconds, 1, 3600, 'durationSeconds');
  const aggregateRate = integer(input.aggregateRate, canonical.aggregateRate, 1, MAX_AGGREGATE_RATE, 'aggregateRate');
  const preAllocatedVUs = integer(input.preAllocatedVUs, canonical.preAllocatedVUs, 1, 10_000, 'preAllocatedVUs');
  const maxVUs = integer(input.maxVUs, canonical.maxVUs, preAllocatedVUs, 20_000, 'maxVUs');
  const stagingUrl = validateStagingUrl(input.stagingUrl ?? '');

  if (totalAgents % shards !== 0) throw new Error('totalAgents must divide evenly across shards');
  if (aggregateRate % shards !== 0) throw new Error('aggregateRate must divide evenly across shards');
  if (aggregateRate * durationSeconds !== totalAgents) {
    throw new Error('aggregateRate * durationSeconds must equal totalAgents for an exact-request plan');
  }

  const requestsPerShard = totalAgents / shards;
  const ratePerShard = aggregateRate / shards;
  if (ratePerShard * durationSeconds !== requestsPerShard) {
    throw new Error('Per-shard rate and duration do not produce the exact shard budget');
  }

  const shardPlans = Array.from({ length: shards }, (_, shardIndex) => ({
    shard_index: shardIndex,
    shard_count: shards,
    distinct_agent_budget: requestsPerShard,
    request_budget: requestsPerShard,
    arrival_rate_per_second: ratePerShard,
    duration_seconds: durationSeconds,
    preallocated_vus: preAllocatedVUs,
    max_vus: maxVUs,
    environment: {
      RISK_GATE_DISTRIBUTED_PROFILE: canonical.profile,
      RISK_GATE_DISTRIBUTED_SHARD_INDEX: String(shardIndex),
      RISK_GATE_DISTRIBUTED_SHARD_COUNT: String(shards),
      RISK_GATE_DISTRIBUTED_REQUESTS: String(requestsPerShard),
      RISK_GATE_DISTRIBUTED_RATE: String(ratePerShard),
      RISK_GATE_DISTRIBUTED_AGGREGATE_RATE: String(aggregateRate),
      RISK_GATE_DISTRIBUTED_DURATION_SECONDS: String(durationSeconds),
      RISK_GATE_DISTRIBUTED_PREALLOCATED_VUS: String(preAllocatedVUs),
      RISK_GATE_DISTRIBUTED_MAX_VUS: String(maxVUs),
      RISK_GATE_DISTRIBUTED_MAX_P95_MS: String(P95_MAX_MS),
      RISK_GATE_DISTRIBUTED_MAX_P99_MS: String(P99_MAX_MS),
      RISK_GATE_DISTRIBUTED_MAX_RESPONSE_BYTES: String(MAX_RESPONSE_BYTES),
    },
  }));

  return {
    suite: 'geomacro-distributed-40k-load-plan-v2',
    profile: canonical.profile,
    generated_at: new Date().toISOString(),
    execution_performed: false,
    production_target_allowed: false,
    target: stagingUrl ? { host: stagingUrl.host, protocol: stagingUrl.protocol } : { host: null, protocol: null },
    workload: {
      distinct_synthetic_agents: totalAgents,
      total_requests: totalAgents,
      shards,
      aggregate_arrival_rate_per_second: aggregateRate,
      duration_seconds: durationSeconds,
      requests_per_shard: requestsPerShard,
      arrival_rate_per_shard_per_second: ratePerShard,
      preallocated_vus_per_shard: preAllocatedVUs,
      max_vus_per_shard: maxVUs,
    },
    correctness_contract: {
      unique_agent_id_per_request: true,
      unique_request_id_per_request: true,
      expected_http_200_only: true,
      execution_authorized_must_equal_false: true,
      api_key_echo_allowed: false,
      sensitive_key_exposure_allowed: false,
      redirects_allowed: false,
      set_cookie_allowed: false,
      cache_control_no_store_required: true,
      json_content_type_required: true,
      nosniff_required: true,
      max_response_bytes: MAX_RESPONSE_BYTES,
      auth_and_abuse_controls_must_remain_enabled: true,
      unexpected_4xx_allowed: 0,
      server_5xx_allowed: 0,
      timeout_allowed: 0,
      network_error_allowed: 0,
      dropped_iterations_allowed: 0,
    },
    latency_objective_ms: { p95_max: P95_MAX_MS, p99_max: P99_MAX_MS },
    activation_boundary: {
      real_payment: false,
      mainnet_activation: false,
      production_load: false,
      public_distribution_activation: false,
    },
    shards: shardPlans,
  };
}

export function runSelfTest() {
  const burst = buildPlan({ profile: PROFILE_BURST });
  if (burst.workload.total_requests !== 1_000_000) throw new Error('1M burst request plan mismatch');
  if (burst.workload.aggregate_arrival_rate_per_second !== 40_000) throw new Error('40k burst rate mismatch');
  if (burst.workload.duration_seconds !== 25 || burst.workload.shards !== 40) throw new Error('40k burst shape mismatch');
  if (burst.workload.requests_per_shard !== 25_000 || burst.workload.arrival_rate_per_shard_per_second !== 1_000) {
    throw new Error('40k burst shard math mismatch');
  }

  const soak = buildPlan({ profile: PROFILE_SOAK });
  if (soak.workload.total_requests !== 12_000_000) throw new Error('40k soak request plan mismatch');
  if (soak.workload.aggregate_arrival_rate_per_second !== 40_000) throw new Error('40k soak rate mismatch');
  if (soak.workload.duration_seconds !== 300 || soak.workload.shards !== 40) throw new Error('40k soak shape mismatch');
  if (soak.workload.requests_per_shard !== 300_000 || soak.workload.arrival_rate_per_shard_per_second !== 1_000) {
    throw new Error('40k soak shard math mismatch');
  }

  for (const productionUrl of ['https://geomacro.live', 'https://www.geomacro.live']) {
    let blocked = false;
    try {
      validateStagingUrl(productionUrl);
    } catch (error) {
      blocked = error instanceof Error && error.message.includes('Production Geomacro host is forbidden');
    }
    if (!blocked) throw new Error(`Production guard failed for ${productionUrl}`);
  }
  console.log('PASS: 40k distributed load plan self-test');
}

if (process.argv.includes('--self-test')) {
  runSelfTest();
} else {
  const profile = process.env.RISK_GATE_DISTRIBUTED_PROFILE?.trim() || PROFILE_BURST;
  const plan = buildPlan({
    profile,
    totalAgents: process.env.RISK_GATE_DISTRIBUTED_TOTAL_AGENTS,
    shards: process.env.RISK_GATE_DISTRIBUTED_SHARDS,
    durationSeconds: process.env.RISK_GATE_DISTRIBUTED_DURATION_SECONDS,
    aggregateRate: process.env.RISK_GATE_DISTRIBUTED_AGGREGATE_RATE,
    preAllocatedVUs: process.env.RISK_GATE_DISTRIBUTED_PREALLOCATED_VUS,
    maxVUs: process.env.RISK_GATE_DISTRIBUTED_MAX_VUS,
    stagingUrl: process.env.RISK_GATE_DISTRIBUTED_STAGING_BASE_URL,
  });
  fs.mkdirSync('artifacts', { recursive: true });
  const output = `artifacts/distributed-load-plan-${profile}.json`;
  fs.writeFileSync(output, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(plan, null, 2));
}
