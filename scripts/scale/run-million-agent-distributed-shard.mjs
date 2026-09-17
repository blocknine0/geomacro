import { spawnSync } from 'node:child_process';
import process from 'node:process';

const PROFILES = {
  million_burst_40k: { requests: 25_000, rate: 1_000, durationSeconds: 25 },
  soak_40k_5m: { requests: 300_000, rate: 1_000, durationSeconds: 300 },
};
const SHARD_COUNT = 40;
const AGGREGATE_RATE = 40_000;
const MAX_START_LATE_MS = 2_000;
const MIN_BARRIER_LEAD_MS = 15_000;
const PRODUCTION_HOSTS = new Set(['geomacro.live', 'www.geomacro.live']);
const ACK = 'I_AUTHORIZE_DISTRIBUTED_ISOLATED_STAGING_LOAD';
const CAPACITY_ACK = 'I_CONFIRMED_STAGING_CAPACITY_AND_QUOTAS';

function required(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function int(name, min, max) {
  const value = Number(required(name));
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer within ${min}..${max}`);
  }
  return value;
}

function assertFullSha(value, name) {
  if (!/^[0-9a-f]{40}$/i.test(value)) throw new Error(`${name} must be a full 40-character git SHA`);
  return value.toLowerCase();
}

function command(commandName, args, options = {}) {
  const result = spawnSync(commandName, args, { encoding: 'utf8', stdio: options.stdio || 'pipe', env: options.env || process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    throw new Error(`${commandName} ${args.join(' ')} failed${detail ? `: ${detail}` : ''}`);
  }
  return String(result.stdout || '').trim();
}

function validateTarget(raw, expectedHost) {
  const url = new URL(raw);
  if (url.protocol !== 'https:') throw new Error('Distributed staging target must use HTTPS');
  if (PRODUCTION_HOSTS.has(url.hostname.toLowerCase())) throw new Error('Production Geomacro host is forbidden for distributed load');
  if (url.username || url.password || url.search || url.hash) throw new Error('Distributed staging URL must not include credentials/query/fragment');
  if (url.host.toLowerCase() !== expectedHost.toLowerCase()) throw new Error('Distributed staging target does not match expected host');
  return url;
}

async function verifyStagingBuild(baseUrl, candidateSha) {
  const endpoint = new URL('/.well-known/geomacro-build.json', baseUrl);
  const response = await fetch(endpoint, {
    headers: { accept: 'application/json', 'user-agent': 'GeomacroDistributedCapacityPreflight/3.0' },
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status !== 200) throw new Error(`Staging build marker expected HTTP 200, got ${response.status}`);
  const body = await response.json();
  const deployedSha = String(body?.canonical_main_sha || '').trim().toLowerCase();
  if (body?.schema_version !== 'geomacro.deployment-build.v1') throw new Error('Staging build marker schema mismatch');
  if (body?.canonical_repository !== 'blocknine0/geomacro') throw new Error('Staging build marker repository mismatch');
  if (body?.production_activation_performed !== false) throw new Error('Staging build marker unexpectedly authorizes production activation');
  if (deployedSha !== candidateSha) throw new Error(`Staging SHA ${deployedSha || 'missing'} does not match candidate ${candidateSha}`);
  return deployedSha;
}

async function waitForBarrier(barrierEpochMs) {
  const lead = barrierEpochMs - Date.now();
  if (lead < MIN_BARRIER_LEAD_MS) {
    throw new Error(`Generator reached preflight too late for safe synchronization: ${lead}ms lead remains`);
  }
  while (Date.now() < barrierEpochMs - 1_000) {
    await new Promise((resolve) => setTimeout(resolve, Math.min(1_000, barrierEpochMs - Date.now() - 1_000)));
  }
  while (Date.now() < barrierEpochMs) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  const launchedAt = Date.now();
  if (launchedAt - barrierEpochMs > MAX_START_LATE_MS) {
    throw new Error(`Generator missed synchronized barrier by ${launchedAt - barrierEpochMs}ms; refusing traffic`);
  }
  return launchedAt;
}

async function main() {
  if (required('RISK_GATE_DISTRIBUTED_ACK') !== ACK) throw new Error(`RISK_GATE_DISTRIBUTED_ACK must equal ${ACK}`);
  if (required('RISK_GATE_DISTRIBUTED_CAPACITY_ACK') !== CAPACITY_ACK) throw new Error(`RISK_GATE_DISTRIBUTED_CAPACITY_ACK must equal ${CAPACITY_ACK}`);

  const candidateSha = assertFullSha(required('RISK_GATE_DISTRIBUTED_CANDIDATE_SHA'), 'RISK_GATE_DISTRIBUTED_CANDIDATE_SHA');
  const profile = required('RISK_GATE_DISTRIBUTED_PROFILE');
  const canonical = PROFILES[profile];
  if (!canonical) throw new Error(`Unknown distributed load profile: ${profile}`);
  const shardIndex = int('RISK_GATE_DISTRIBUTED_SHARD_INDEX', 0, SHARD_COUNT - 1);
  const barrierEpochMs = int('RISK_GATE_DISTRIBUTED_BARRIER_EPOCH_MS', Date.now() + MIN_BARRIER_LEAD_MS, Date.now() + 3_600_000);
  const runGroupId = required('RISK_GATE_DISTRIBUTED_RUN_GROUP_ID');
  const generatorId = required('RISK_GATE_DISTRIBUTED_GENERATOR_ID');
  const deploymentId = required('RISK_GATE_DISTRIBUTED_DEPLOYMENT_ID');
  const expectedHost = required('RISK_GATE_DISTRIBUTED_EXPECTED_HOST');
  const baseUrl = validateTarget(required('RISK_GATE_DISTRIBUTED_STAGING_BASE_URL'), expectedHost);

  const localSha = assertFullSha(command('git', ['rev-parse', 'HEAD']), 'local git HEAD');
  if (localSha !== candidateSha) throw new Error(`Checked-out SHA ${localSha} does not match candidate ${candidateSha}`);
  command('k6', ['version']);
  await verifyStagingBuild(baseUrl, candidateSha);

  // Parse/validate the complete key pool without logging it. The k6 workload independently
  // validates uniqueness, key length, and rate-control capacity immediately before traffic.
  let apiKeys;
  try { apiKeys = JSON.parse(required('RISK_GATE_DISTRIBUTED_API_KEYS_JSON')); } catch { throw new Error('RISK_GATE_DISTRIBUTED_API_KEYS_JSON must be valid JSON'); }
  if (!Array.isArray(apiKeys) || apiKeys.length < 1) throw new Error('Distributed API-key pool must be a non-empty array');
  const maxRatePerClient = int('RISK_GATE_DISTRIBUTED_MAX_RATE_PER_CLIENT', 1, AGGREGATE_RATE);
  if (apiKeys.length < Math.ceil(AGGREGATE_RATE / maxRatePerClient)) throw new Error('API-key pool is too small for normal per-client rate controls');

  const launchedAt = await waitForBarrier(barrierEpochMs);
  const env = {
    ...process.env,
    RISK_GATE_DISTRIBUTED_SHARD_COUNT: String(SHARD_COUNT),
    RISK_GATE_DISTRIBUTED_REQUESTS: String(canonical.requests),
    RISK_GATE_DISTRIBUTED_RATE: String(canonical.rate),
    RISK_GATE_DISTRIBUTED_AGGREGATE_RATE: String(AGGREGATE_RATE),
    RISK_GATE_DISTRIBUTED_DURATION_SECONDS: String(canonical.durationSeconds),
    RISK_GATE_DISTRIBUTED_PREALLOCATED_VUS: '2000',
    RISK_GATE_DISTRIBUTED_MAX_VUS: '6000',
    RISK_GATE_DISTRIBUTED_MAX_P95_MS: '1500',
    RISK_GATE_DISTRIBUTED_MAX_P99_MS: '3000',
    RISK_GATE_DISTRIBUTED_MAX_RESPONSE_BYTES: '262144',
    RISK_GATE_DISTRIBUTED_GENERATOR_LAUNCH_EPOCH_MS: String(launchedAt),
    RISK_GATE_DISTRIBUTED_VERIFIED_STAGING_SHA: candidateSha,
    RISK_GATE_DISTRIBUTED_RUN_GROUP_ID: runGroupId,
    RISK_GATE_DISTRIBUTED_GENERATOR_ID: generatorId,
    RISK_GATE_DISTRIBUTED_DEPLOYMENT_ID: deploymentId,
  };

  console.log(`Starting ${profile} shard ${shardIndex}/${SHARD_COUNT - 1} on verified staging SHA ${candidateSha.slice(0, 12)} at synchronized barrier.`);
  const result = spawnSync('k6', ['run', 'scripts/scale/risk-gate-million-agent.k6.js'], { stdio: 'inherit', env });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`k6 shard ${shardIndex} failed with exit ${result.status}`);
}

main().catch((error) => {
  console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
