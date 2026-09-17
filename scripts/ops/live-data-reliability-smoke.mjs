import fs from 'node:fs';
import process from 'node:process';

const LIVE = (process.env.GEOMACRO_LIVE_BASE_URL || 'https://geomacro.live').replace(/\/$/, '');
const EXPECTED_HOST = process.env.GEOMACRO_LIVE_EXPECTED_HOST || 'geomacro.live';
const EXPECTED_SHA = String(process.env.GEOMACRO_EXPECTED_DEPLOYED_SHA || '').trim().toLowerCase();
const AUTHORITATIVE_REF = 'ldpwajisioljyjtojvfx';
const RISK_EDGE = `https://${AUTHORITATIVE_REF}.supabase.co/functions/v1/public-risk-indices`;
const WARNING_EDGE = `https://${AUTHORITATIVE_REF}.supabase.co/functions/v1/public-early-warning?limit=1`;
const TIMEOUT_MS = 12_000;

function assert(ok, message) {
  if (!ok) throw new Error(message);
}

const base = new URL(LIVE);
assert(base.protocol === 'https:', 'Live data smoke requires HTTPS');
assert(base.hostname === EXPECTED_HOST, `Refusing unexpected live host ${base.hostname}`);
assert(/^[0-9a-f]{40}$/.test(EXPECTED_SHA), 'GEOMACRO_EXPECTED_DEPLOYED_SHA must be a full SHA');

async function get(url, accept = '*/*') {
  const started = performance.now();
  const response = await fetch(url, {
    redirect: 'error',
    headers: { accept, 'cache-control': 'no-cache', 'user-agent': 'GeomacroLiveDataReliability/1.0' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await response.text();
  return { response, text, elapsed_ms: Number((performance.now() - started).toFixed(2)) };
}

const evidence = {
  schema_version: 'geomacro.live-data-reliability-smoke.v1',
  generated_at: new Date().toISOString(),
  expected_sha: EXPECTED_SHA,
  live_host: base.host,
  public_pages: {},
  authoritative_paths: {},
  production_mutation: false,
  payment_or_mainnet_activation: false,
  result: 'RUNNING',
};

function save() {
  fs.mkdirSync('artifacts', { recursive: true });
  fs.writeFileSync('artifacts/live-data-reliability-smoke.json', `${JSON.stringify(evidence, null, 2)}\n`);
}

try {
  const buildResult = await get(`${LIVE}/.well-known/geomacro-build.json`, 'application/json');
  assert(buildResult.response.status === 200, `live build marker HTTP ${buildResult.response.status}`);
  const build = JSON.parse(buildResult.text);
  assert(build?.schema_version === 'geomacro.deployment-build.v1', 'live build marker schema mismatch');
  assert(String(build?.canonical_main_sha || '').toLowerCase() === EXPECTED_SHA, 'live build marker SHA mismatch');
  assert(build?.production_activation_performed === false, 'live build marker unexpectedly authorizes production activation');

  const pageChecks = [
    ['/institutional', ['Verified snapshot unavailable.', 'Risk index store unavailable', 'Institutional intelligence unavailable']],
    ['/global-risk', ['Risk index store unavailable', 'Verified risk indices are unavailable', 'Risk indices temporarily unavailable']],
    ['/intelligence', ['Intelligence temporarily unavailable', 'Intelligence store unavailable', 'Intelligence feed unavailable']],
  ];
  for (const [path, forbidden] of pageChecks) {
    const result = await get(`${LIVE}${path}`, 'text/html');
    assert(result.response.status === 200, `${path} expected 200, got ${result.response.status}`);
    assert(String(result.response.headers.get('content-type') || '').includes('text/html'), `${path} did not return HTML`);
    assert(result.text.length > 500, `${path} returned unexpectedly small HTML`);
    for (const marker of forbidden) assert(!result.text.includes(marker), `${path} exposed normal-state infrastructure failure marker: ${marker}`);
    assert(!/Internal Server Error|Application error|ReferenceError:\s|TypeError:\s/i.test(result.text), `${path} exposed an application failure marker`);
    evidence.public_pages[path] = { status: result.response.status, elapsed_ms: result.elapsed_ms, normal_state_failure_marker: false };
  }

  const publicWarning = await get(`${LIVE}/api/early-warning?limit=1`, 'application/json');
  assert(publicWarning.response.status === 200, `/api/early-warning expected 200, got ${publicWarning.response.status}`);
  const publicWarningBody = JSON.parse(publicWarning.text);
  assert(publicWarningBody?.feed_schema_version === 'geomacro.public-early-warning-feed.v1', 'public Early Warning feed schema mismatch');
  assert(Array.isArray(publicWarningBody?.items), 'public Early Warning items missing');

  const warningEdge = await get(WARNING_EDGE, 'application/json');
  assert(warningEdge.response.status === 200, `authoritative Early Warning Edge HTTP ${warningEdge.response.status}`);
  const warning = JSON.parse(warningEdge.text);
  assert(warning?.ok === true, 'authoritative Early Warning Edge is not ok');
  assert(warning?.contract_version === 'public-early-warning-edge-v1', 'authoritative Early Warning contract mismatch');
  assert(warning?.degraded === false, `authoritative Early Warning Edge remains degraded: ${warning?.degraded_reason || 'unknown'}`);
  assert(Array.isArray(warning?.rows), 'authoritative Early Warning rows missing');
  evidence.authoritative_paths.early_warning = { status: 200, degraded: false, row_count: warning.rows.length, elapsed_ms: warningEdge.elapsed_ms };

  const riskEdge = await get(RISK_EDGE, 'application/json');
  assert(riskEdge.response.status === 200, `authoritative Risk Indices Edge HTTP ${riskEdge.response.status}`);
  const risk = JSON.parse(riskEdge.text);
  assert(risk?.ok === true, 'authoritative Risk Indices Edge is not ok');
  assert(risk?.data?.contractVersion === 'geomacro.public-risk-indices.v1', 'Risk Indices contract mismatch');
  assert(risk?.data?.verificationStatus === 'verified', 'Risk Indices are not verified');
  assert(Array.isArray(risk?.data?.indices) && risk.data.indices.length === 3, 'Risk Indices must contain exactly three domains');
  const expectedKeys = ['critical_minerals', 'geopolitics', 'macro'];
  const keys = risk.data.indices.map((row) => row?.key).sort();
  assert(JSON.stringify(keys) === JSON.stringify(expectedKeys), 'Risk Indices domain set mismatch');
  for (const row of risk.data.indices) {
    assert(row?.status === 'available', `Risk Index ${row?.key || 'unknown'} is not available at launch closure`);
    assert(typeof row?.score === 'number' && Number.isFinite(row.score), `Risk Index ${row?.key || 'unknown'} missing finite score`);
  }
  evidence.authoritative_paths.risk_indices = {
    status: 200,
    verification_status: 'verified',
    indices: risk.data.indices.map((row) => ({ key: row.key, status: row.status })),
    elapsed_ms: riskEdge.elapsed_ms,
  };

  evidence.result = 'PASS';
  save();
  console.log('PASS: exact live SHA, institutional/intelligence normal-state rendering, authoritative Risk Indices, and non-degraded Early Warning paths are healthy.');
} catch (error) {
  evidence.result = 'FAIL';
  evidence.failure = error instanceof Error ? error.message : String(error);
  save();
  console.error(`FAIL: ${evidence.failure}`);
  throw error;
}
