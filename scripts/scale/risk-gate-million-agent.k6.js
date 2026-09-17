import http from 'k6/http';
import { check } from 'k6';
import exec from 'k6/execution';
import { Counter } from 'k6/metrics';

const PRODUCTION_HOSTS = new Set(['geomacro.live', 'www.geomacro.live']);
const ACK = 'I_AUTHORIZE_DISTRIBUTED_ISOLATED_STAGING_LOAD';
const CAPACITY_ACK = 'I_CONFIRMED_STAGING_CAPACITY_AND_QUOTAS';
const SENSITIVE_KEY_PATTERN = /(authorization|api[_-]?key|api[_-]?secret|private[_-]?key|service[_-]?role|payment[_-]?signature|bearer[_-]?token)/i;
const SHA_PATTERN = /^[0-9a-f]{40}$/i;
const MAX_GENERATOR_START_LATE_MS = 2_000;

function required(name) {
  const value = (__ENV[name] || '').trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function boundedInteger(name, min, max) {
  const raw = required(name);
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer within ${min}..${max}`);
  }
  return value;
}

function epochInteger(name) {
  const value = Number(required(name));
  if (!Number.isSafeInteger(value) || value < 1_600_000_000_000 || value > 4_000_000_000_000) {
    throw new Error(`${name} must be a valid millisecond epoch`);
  }
  return value;
}

function fullSha(name) {
  const value = required(name).toLowerCase();
  if (!SHA_PATTERN.test(value)) throw new Error(`${name} must be a full 40-character git SHA`);
  return value;
}

function parseTarget() {
  if (required('RISK_GATE_DISTRIBUTED_ACK') !== ACK) throw new Error(`RISK_GATE_DISTRIBUTED_ACK must equal ${ACK}`);
  if (required('RISK_GATE_DISTRIBUTED_CAPACITY_ACK') !== CAPACITY_ACK) {
    throw new Error(`RISK_GATE_DISTRIBUTED_CAPACITY_ACK must equal ${CAPACITY_ACK}`);
  }
  const baseUrl = new URL(required('RISK_GATE_DISTRIBUTED_STAGING_BASE_URL'));
  const hostname = baseUrl.hostname.toLowerCase();
  if (PRODUCTION_HOSTS.has(hostname)) throw new Error('Production Geomacro host is forbidden for distributed load');
  if (baseUrl.protocol !== 'https:') throw new Error('Distributed staging target must use HTTPS');
  if (baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash) {
    throw new Error('Distributed staging URL must not contain credentials, query parameters or fragments');
  }
  const expectedHost = required('RISK_GATE_DISTRIBUTED_EXPECTED_HOST').toLowerCase();
  if (baseUrl.host.toLowerCase() !== expectedHost) {
    throw new Error('Distributed staging target host does not match explicit expected host');
  }
  return { baseUrl, endpoint: new URL('/api/risk-gate', baseUrl).toString() };
}

function parseApiKeys() {
  let parsed;
  try {
    parsed = JSON.parse(required('RISK_GATE_DISTRIBUTED_API_KEYS_JSON'));
  } catch {
    throw new Error('RISK_GATE_DISTRIBUTED_API_KEYS_JSON must be a JSON array');
  }
  if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > 10_000) {
    throw new Error('Distributed staging API key pool must contain 1..10000 keys');
  }
  const keys = parsed.map((value) => String(value).trim());
  if (keys.some((key) => key.length < 32 || key.length > 512)) {
    throw new Error('Distributed staging API key has invalid length');
  }
  if (new Set(keys).size !== keys.length) throw new Error('Distributed staging API key pool must contain unique keys');
  return keys;
}

const target = parseTarget();
const profile = required('RISK_GATE_DISTRIBUTED_PROFILE');
const apiKeys = parseApiKeys();
const candidateSha = fullSha('RISK_GATE_DISTRIBUTED_CANDIDATE_SHA');
const verifiedStagingSha = fullSha('RISK_GATE_DISTRIBUTED_VERIFIED_STAGING_SHA');
if (candidateSha !== verifiedStagingSha) throw new Error('Verified staging SHA does not match candidate SHA');
const deploymentId = required('RISK_GATE_DISTRIBUTED_DEPLOYMENT_ID');
const runGroupId = required('RISK_GATE_DISTRIBUTED_RUN_GROUP_ID');
const generatorId = required('RISK_GATE_DISTRIBUTED_GENERATOR_ID');
const barrierEpochMs = epochInteger('RISK_GATE_DISTRIBUTED_BARRIER_EPOCH_MS');
const generatorLaunchEpochMs = epochInteger('RISK_GATE_DISTRIBUTED_GENERATOR_LAUNCH_EPOCH_MS');
const launchOffsetMs = generatorLaunchEpochMs - barrierEpochMs;
if (launchOffsetMs < 0 || launchOffsetMs > MAX_GENERATOR_START_LATE_MS) {
  throw new Error(`Generator launch offset ${launchOffsetMs}ms is outside synchronized barrier tolerance`);
}
const shardIndex = boundedInteger('RISK_GATE_DISTRIBUTED_SHARD_INDEX', 0, 99);
const shardCount = boundedInteger('RISK_GATE_DISTRIBUTED_SHARD_COUNT', 1, 100);
if (shardIndex >= shardCount) throw new Error('Shard index must be smaller than shard count');
const requestBudget = boundedInteger('RISK_GATE_DISTRIBUTED_REQUESTS', 1, 12_000_000);
const rate = boundedInteger('RISK_GATE_DISTRIBUTED_RATE', 1, 40_000);
const aggregateRate = boundedInteger('RISK_GATE_DISTRIBUTED_AGGREGATE_RATE', 1, 40_000);
const durationSeconds = boundedInteger('RISK_GATE_DISTRIBUTED_DURATION_SECONDS', 1, 3600);
const preAllocatedVUs = boundedInteger('RISK_GATE_DISTRIBUTED_PREALLOCATED_VUS', 1, 10_000);
const maxVUs = boundedInteger('RISK_GATE_DISTRIBUTED_MAX_VUS', preAllocatedVUs, 20_000);
const maxP95Ms = boundedInteger('RISK_GATE_DISTRIBUTED_MAX_P95_MS', 1, 10_000);
const maxP99Ms = boundedInteger('RISK_GATE_DISTRIBUTED_MAX_P99_MS', maxP95Ms, 20_000);
const maxResponseBytes = boundedInteger('RISK_GATE_DISTRIBUTED_MAX_RESPONSE_BYTES', 1_024, 1_048_576);
const maxRatePerClient = boundedInteger('RISK_GATE_DISTRIBUTED_MAX_RATE_PER_CLIENT', 1, 40_000);

if (rate * durationSeconds !== requestBudget) throw new Error('Per-shard rate * duration must equal exact request budget');
if (rate * shardCount !== aggregateRate) throw new Error('Per-shard rate * shard count must equal aggregate rate');
const requiredClientCount = Math.ceil(aggregateRate / maxRatePerClient);
if (apiKeys.length < requiredClientCount) {
  throw new Error(`API key pool is too small for normal per-client rate controls: need at least ${requiredClientCount}`);
}

const responseSecurityViolations = new Counter('response_security_violations');
const executionBoundaryViolations = new Counter('execution_boundary_violations');
const unexpectedStatus = new Counter('unexpected_status');
const nonJsonResponses = new Counter('non_json_responses');
const responseHeaderViolations = new Counter('response_header_violations');
const oversizedResponses = new Counter('oversized_responses');

export const options = {
  maxRedirects: 0,
  discardResponseBodies: false,
  scenarios: {
    distributed_40k_shard: {
      executor: 'constant-arrival-rate',
      rate,
      timeUnit: '1s',
      duration: `${durationSeconds}s`,
      preAllocatedVUs,
      maxVUs,
      gracefulStop: '15s',
    },
  },
  thresholds: {
    http_req_failed: ['rate==0'],
    http_req_duration: [`p(95)<${maxP95Ms}`, `p(99)<${maxP99Ms}`],
    dropped_iterations: ['count==0'],
    response_security_violations: ['count==0'],
    execution_boundary_violations: ['count==0'],
    unexpected_status: ['count==0'],
    non_json_responses: ['count==0'],
    response_header_violations: ['count==0'],
    oversized_responses: ['count==0'],
  },
};

function hasSensitiveKey(value) {
  if (Array.isArray(value)) return value.some(hasSensitiveKey);
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, child]) => SENSITIVE_KEY_PATTERN.test(key) || hasSensitiveKey(child));
}

function executionAuthorizedIsFalse(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  if (payload.execution_authorized === false) return true;
  return Boolean(
    payload.risk_gate &&
    typeof payload.risk_gate === 'object' &&
    !Array.isArray(payload.risk_gate) &&
    payload.risk_gate.execution_authorized === false
  );
}

function requestBody(iteration) {
  const iso3 = ['USA', 'IND', 'CHN', 'DEU', 'JPN', 'BRA', 'GBR', 'FRA'][iteration % 8];
  const unique = `${runGroupId}-${shardIndex}-${iteration}`;
  return {
    request_id: `distributed_staging_${unique}`,
    subject: { type: 'country', country_iso3: iso3 },
    action_context: {
      action_type: 'distributed_staging_capacity_test',
      currency: 'USDC',
      metadata: { synthetic: true, load_test: true, agent_id: `synthetic-agent-${unique}`, shard_index: shardIndex },
    },
    policy: {
      policy_id: 'geomacro-distributed-staging-capacity',
      policy_version: '1.0.0',
      continue_max_score: 35,
      reduce_limit_max_score: 55,
      require_approval_max_score: 75,
      minimum_confidence_for_auto_continue: 0.8,
      require_commercial_verification_for_continue: true,
      max_positive_delta_for_auto_continue: 10,
      hard_stop_driver_contributions: { sanctions: 20 },
    },
  };
}

function header(response, name) {
  const lower = name.toLowerCase();
  const key = Object.keys(response.headers || {}).find((candidate) => candidate.toLowerCase() === lower);
  return key ? String(response.headers[key] || '') : '';
}

export default function () {
  const iteration = exec.scenario.iterationInTest;
  const apiKey = apiKeys[(iteration + shardIndex) % apiKeys.length];
  const body = JSON.stringify(requestBody(iteration));
  const response = http.post(target.endpoint, body, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': `geomacro-distributed-staging-load/3.0 profile/${profile} shard/${shardIndex}`,
    },
    redirects: 0,
    timeout: '10s',
    tags: { suite: 'geomacro-distributed-40k-load-v3', profile, shard: String(shardIndex) },
  });

  if (response.status !== 200) unexpectedStatus.add(1);
  const raw = response.body || '';
  if (raw.length > maxResponseBytes) oversizedResponses.add(1);
  if (raw.includes(apiKey)) responseSecurityViolations.add(1);

  const contentType = header(response, 'content-type').toLowerCase();
  const cacheControl = header(response, 'cache-control').toLowerCase();
  const setCookie = header(response, 'set-cookie');
  const nosniff = header(response, 'x-content-type-options').toLowerCase();
  const headersSecure = contentType.includes('application/json') && cacheControl.includes('no-store') && !setCookie && nosniff === 'nosniff';
  if (!headersSecure) responseHeaderViolations.add(1);

  let payload = null;
  try {
    payload = response.json();
  } catch (_) {
    nonJsonResponses.add(1);
  }
  if (payload && hasSensitiveKey(payload)) responseSecurityViolations.add(1);
  if (!executionAuthorizedIsFalse(payload)) executionBoundaryViolations.add(1);

  check(response, {
    'HTTP 200': (r) => r.status === 200,
    'response is JSON': () => payload !== null,
    'execution remains unauthorized': () => executionAuthorizedIsFalse(payload),
    'selected API key is not echoed': () => !raw.includes(apiKey),
    'sensitive keys are not exposed': () => !payload || !hasSensitiveKey(payload),
    'response body remains bounded': () => raw.length <= maxResponseBytes,
    'security response headers remain intact': () => headersSecure,
  });
}

export function handleSummary(data) {
  const safeSummary = {
    suite: 'geomacro-distributed-40k-load-v3',
    profile,
    candidate_sha: candidateSha,
    verified_staging_sha: verifiedStagingSha,
    deployment_id: deploymentId,
    run_group_id: runGroupId,
    generator_id: generatorId,
    orchestrator_barrier_epoch_ms: barrierEpochMs,
    generator_launch_epoch_ms: generatorLaunchEpochMs,
    generator_launch_offset_ms: launchOffsetMs,
    shard_index: shardIndex,
    shard_count: shardCount,
    expected_request_budget: requestBudget,
    aggregate_rate_per_second: aggregateRate,
    duration_seconds: durationSeconds,
    api_client_count: apiKeys.length,
    declared_max_rate_per_client: maxRatePerClient,
    target_host: target.baseUrl.host,
    production_target: false,
    execution_authorized: false,
    auth_and_abuse_controls_bypassed: false,
    capacity_and_quota_acknowledged: true,
    metrics: {
      http_reqs: data.metrics.http_reqs?.values?.count ?? null,
      http_req_duration_p95_ms: data.metrics.http_req_duration?.values?.['p(95)'] ?? null,
      http_req_duration_p99_ms: data.metrics.http_req_duration?.values?.['p(99)'] ?? null,
      http_req_failed_rate: data.metrics.http_req_failed?.values?.rate ?? null,
      dropped_iterations: data.metrics.dropped_iterations?.values?.count ?? 0,
      response_security_violations: data.metrics.response_security_violations?.values?.count ?? 0,
      execution_boundary_violations: data.metrics.execution_boundary_violations?.values?.count ?? 0,
      unexpected_status: data.metrics.unexpected_status?.values?.count ?? 0,
      non_json_responses: data.metrics.non_json_responses?.values?.count ?? 0,
      response_header_violations: data.metrics.response_header_violations?.values?.count ?? 0,
      oversized_responses: data.metrics.oversized_responses?.values?.count ?? 0,
    },
    latency_objective_ms: { p95_max: maxP95Ms, p99_max: maxP99Ms },
    limitations: [
      'isolated staging only',
      'normal authentication and abuse controls remain enabled',
      'no real payment settlement',
      'no mainnet activation',
      'does not prove 40,000 simultaneous open connections',
    ],
  };
  return {
    stdout: `${JSON.stringify(safeSummary, null, 2)}\n`,
    [`artifacts/distributed-40k-${profile}-shard-${shardIndex}.json`]: `${JSON.stringify(safeSummary, null, 2)}\n`,
  };
}
