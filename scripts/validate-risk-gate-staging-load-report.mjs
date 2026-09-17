import fs from 'node:fs';
import process from 'node:process';

const DEFAULT_MAX_P95_MS = 3000;
const DEFAULT_MAX_P99_MS = 8000;
const MAX_ALLOWED_SLO_MS = 30000;

function envInteger(name, fallback) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > MAX_ALLOWED_SLO_MS) {
    throw new Error(`${name} must be an integer within 1..${MAX_ALLOWED_SLO_MS}`);
  }
  return value;
}

function loadReport(path) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`Unable to read staging load report: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Staging load report must be a JSON object');
  }
  return parsed;
}

function finiteNumber(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${field} must be finite`);
  return number;
}

export function validateReport(report, { maxP95Ms, maxP99Ms }) {
  if (report.suite !== 'risk-gate-staging-http-load-v1') {
    throw new Error('Unexpected staging load suite');
  }

  if (!report.target || typeof report.target !== 'object') {
    throw new Error('Staging load target is missing');
  }

  const host = String(report.target.host ?? '').toLowerCase();
  if (!host || host === 'geomacro.live' || host === 'www.geomacro.live') {
    throw new Error('Production Geomacro host is forbidden in staging load evidence');
  }

  if (report.workload?.redirect_policy !== 'error') {
    throw new Error('Staging load evidence must prove redirects were refused');
  }

  const correctness = report.correctness;
  if (!correctness || typeof correctness !== 'object') {
    throw new Error('Staging load correctness block is missing');
  }

  const requiredZero = [
    'unexpected_4xx',
    'server_errors_5xx',
    'timeouts',
    'network_errors',
    'non_json_responses',
    'execution_boundary_violations',
    'response_security_violations',
  ];

  for (const field of requiredZero) {
    if (finiteNumber(correctness[field], `correctness.${field}`) !== 0) {
      throw new Error(`Staging load evidence failed: correctness.${field} must be zero`);
    }
  }

  if (finiteNumber(correctness.successful_200, 'correctness.successful_200') < 1) {
    throw new Error('Staging load evidence requires at least one successful HTTP 200 response');
  }

  if (report.workload?.allow_429 !== true && finiteNumber(correctness.rate_limited_429, 'correctness.rate_limited_429') !== 0) {
    throw new Error('Unexpected HTTP 429 responses are not allowed in the normal staging load run');
  }

  const p95 = finiteNumber(report.latency_ms?.p95, 'latency_ms.p95');
  const p99 = finiteNumber(report.latency_ms?.p99, 'latency_ms.p99');

  if (p95 > maxP95Ms) {
    throw new Error(`Staging Risk Gate p95 ${p95}ms exceeds prelaunch SLO ${maxP95Ms}ms`);
  }

  if (p99 > maxP99Ms) {
    throw new Error(`Staging Risk Gate p99 ${p99}ms exceeds prelaunch SLO ${maxP99Ms}ms`);
  }

  if (report.pass !== true) {
    throw new Error('Underlying staging load harness did not pass');
  }

  return {
    suite: 'risk-gate-staging-load-evidence-validation-v1',
    source_suite: report.suite,
    host,
    successful_200: Number(correctness.successful_200),
    latency_ms: { p95, p99 },
    prelaunch_slo_ms: {
      max_p95: maxP95Ms,
      max_p99: maxP99Ms,
    },
    redirect_refusal_gate: true,
    correctness_zero_error_gate: true,
    execution_boundary_gate: true,
    response_security_gate: true,
    pass: true,
  };
}

export function runSelfTest() {
  const good = {
    suite: 'risk-gate-staging-http-load-v1',
    target: { host: 'staging.example.test' },
    workload: { allow_429: false, redirect_policy: 'error' },
    latency_ms: { p95: 900, p99: 1500 },
    correctness: {
      successful_200: 100,
      rate_limited_429: 0,
      unexpected_4xx: 0,
      server_errors_5xx: 0,
      timeouts: 0,
      network_errors: 0,
      non_json_responses: 0,
      execution_boundary_violations: 0,
      response_security_violations: 0,
    },
    pass: true,
  };

  validateReport(good, { maxP95Ms: 3000, maxP99Ms: 8000 });

  for (const mutation of [
    (value) => { value.target.host = 'geomacro.live'; },
    (value) => { value.workload.redirect_policy = 'follow'; },
    (value) => { value.correctness.server_errors_5xx = 1; },
    (value) => { value.correctness.execution_boundary_violations = 1; },
    (value) => { value.correctness.response_security_violations = 1; },
    (value) => { value.latency_ms.p99 = 9000; },
  ]) {
    const candidate = structuredClone(good);
    mutation(candidate);
    let rejected = false;
    try {
      validateReport(candidate, { maxP95Ms: 3000, maxP99Ms: 8000 });
    } catch {
      rejected = true;
    }
    if (!rejected) throw new Error('Self-test expected invalid staging evidence to be rejected');
  }

  console.log('PASS: staging load report validator self-test');
}

if (process.argv.includes('--self-test')) {
  runSelfTest();
} else {
  const reportPath = process.env.RISK_GATE_LOAD_TEST_REPORT?.trim() || 'artifacts/risk-gate-staging-http-load.json';
  const maxP95Ms = envInteger('RISK_GATE_LOAD_TEST_MAX_P95_MS', DEFAULT_MAX_P95_MS);
  const maxP99Ms = envInteger('RISK_GATE_LOAD_TEST_MAX_P99_MS', DEFAULT_MAX_P99_MS);
  if (maxP95Ms > maxP99Ms) {
    throw new Error('RISK_GATE_LOAD_TEST_MAX_P95_MS must be <= RISK_GATE_LOAD_TEST_MAX_P99_MS');
  }

  const evidence = validateReport(loadReport(reportPath), { maxP95Ms, maxP99Ms });
  fs.writeFileSync(
    'artifacts/risk-gate-staging-http-load-validation.json',
    `${JSON.stringify(evidence, null, 2)}\n`,
    'utf8',
  );
  console.log(JSON.stringify(evidence, null, 2));
}
