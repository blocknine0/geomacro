import fs from 'node:fs';
import process from 'node:process';

const PRODUCTION_HOSTS = new Set(['geomacro.live', 'www.geomacro.live']);

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

function telemetryUrl() {
  const url = new URL(required('RISK_GATE_DISTRIBUTED_TELEMETRY_URL'));
  if (url.protocol !== 'https:') throw new Error('Telemetry collector must use HTTPS');
  if (PRODUCTION_HOSTS.has(url.hostname.toLowerCase())) throw new Error('Production Geomacro host cannot be the staging telemetry collector');
  if (url.username || url.password || url.hash) throw new Error('Telemetry URL must not contain credentials or fragments');
  const expectedHost = required('RISK_GATE_DISTRIBUTED_TELEMETRY_EXPECTED_HOST').toLowerCase();
  if (url.host.toLowerCase() !== expectedHost) throw new Error('Telemetry collector expected-host mismatch');
  return url;
}

async function main() {
  const url = telemetryUrl();
  const token = required('RISK_GATE_DISTRIBUTED_TELEMETRY_TOKEN');
  if (token.length < 32 || token.length > 2048) throw new Error('Telemetry token length is invalid');
  const candidateSha = fullSha(required('RISK_GATE_DISTRIBUTED_CANDIDATE_SHA'), 'candidate SHA');
  const deploymentId = required('RISK_GATE_DISTRIBUTED_DEPLOYMENT_ID');
  const burstRunGroupId = required('RISK_GATE_DISTRIBUTED_BURST_RUN_GROUP_ID');
  const soakRunGroupId = required('RISK_GATE_DISTRIBUTED_SOAK_RUN_GROUP_ID');
  const targetHost = required('RISK_GATE_DISTRIBUTED_TARGET_HOST').toLowerCase();
  if (PRODUCTION_HOSTS.has(targetHost)) throw new Error('Telemetry request target_host must be isolated staging');

  const response = await fetch(url, {
    method: 'POST',
    redirect: 'error',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      accept: 'application/json',
      'user-agent': 'GeomacroDistributedCapacityTelemetry/2.0',
    },
    body: JSON.stringify({
      schema_version: 'geomacro.distributed-40k-telemetry-query.v1',
      candidate_sha: candidateSha,
      deployment_id: deploymentId,
      target_host: targetHost,
      burst_run_group_id: burstRunGroupId,
      soak_run_group_id: soakRunGroupId,
      required_surfaces: ['db_pool', 'edge_runtime', 'auth_rate_limit', 'security', 'idempotency_replay'],
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  if (raw.includes(token)) throw new Error('Telemetry collector echoed its bearer token');
  if (response.status !== 200) throw new Error(`Telemetry collector HTTP ${response.status}`);
  if (!String(response.headers.get('content-type') || '').toLowerCase().includes('application/json')) throw new Error('Telemetry collector did not return JSON');

  let payload;
  try { payload = JSON.parse(raw); } catch { throw new Error('Telemetry collector returned invalid JSON'); }
  if (payload?.schema_version !== 'geomacro.distributed-40k-infra-telemetry.v2') throw new Error('Telemetry collector schema mismatch');
  if (String(payload?.candidate_sha || '').toLowerCase() !== candidateSha) throw new Error('Telemetry response candidate SHA mismatch');
  if (String(payload?.deployment_id || '') !== deploymentId) throw new Error('Telemetry response deployment mismatch');
  if (String(payload?.target_host || '').toLowerCase() !== targetHost) throw new Error('Telemetry response target mismatch');
  if (String(payload?.burst_run_group_id || '') !== burstRunGroupId || String(payload?.soak_run_group_id || '') !== soakRunGroupId) {
    throw new Error('Telemetry response run-group mismatch');
  }
  if (payload?.collector?.authenticated_query !== true) throw new Error('Telemetry collector did not attest authenticated query');

  fs.mkdirSync('artifacts', { recursive: true });
  fs.writeFileSync('artifacts/distributed-40k-infra-telemetry.json', `${JSON.stringify(payload, null, 2)}\n`);
  console.log('PASS: authenticated isolated-staging infrastructure telemetry retrieved and bound to exact capacity run groups.');
}

if (process.argv.includes('--self-test')) {
  let blocked = false;
  process.env.RISK_GATE_DISTRIBUTED_TELEMETRY_URL = 'https://geomacro.live/telemetry';
  process.env.RISK_GATE_DISTRIBUTED_TELEMETRY_EXPECTED_HOST = 'geomacro.live';
  try { telemetryUrl(); } catch { blocked = true; }
  if (!blocked) throw new Error('Telemetry production-host guard self-test failed');
  console.log('PASS: telemetry collector safety self-test');
} else {
  main().catch((error) => {
    console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
