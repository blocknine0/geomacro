import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const CATEGORIES = [
  { category: 'geopolitics', topics: ['conflict_geopolitics'], modules: ['geopolitical_security'] },
  { category: 'macro-fx', topics: ['macro_risk', 'fx_external_risk'], modules: ['external_fx', 'macro_monetary', 'sovereign_fiscal'] },
  { category: 'critical-minerals', topics: ['critical_minerals'], modules: ['critical_minerals'] },
];
const sameSet = (actual, expected) => Array.isArray(actual) && actual.length === expected.length &&
  [...actual].sort().every((item, index) => item === [...expected].sort()[index]);

// Summary contains fixed codes/counts only. Never persist response bodies, source
// identities, payment challenges, cookies or provider diagnostic strings.
export function assessCategory(config, discovery, query, origin) {
  const path = `/api/v1/intelligence/${config.category}`;
  const metadata = discovery.body;
  const scopeVerified = discovery.status === 200 && metadata?.ok === true &&
    metadata.category === config.category && metadata.endpoint === `${origin}${path}` &&
    metadata.canonical_endpoint === `${origin}/api/v1/intelligence/query` &&
    sameSet(metadata.topics, config.topics) && sameSet(metadata.required_modules, config.modules) &&
    metadata.execution_authorized === false;
  const mainnet = metadata?.environment === 'production' && metadata?.network === 'eip155:8453';
  const challenge = query.body;
  const accepts = challenge?.accepts;
  const mainnetDeliverable = query.status === 402 && challenge?.x402Version === 2 &&
    challenge?.resource?.url === `${origin}/api/v1/intelligence/query` &&
    Array.isArray(accepts) && accepts.length > 0 && accepts.every(a => a?.network === 'eip155:8453') &&
    challenge?.extensions?.geomacro?.info?.execution_authorized === false;
  const safelyUnavailable = query.status === 422 && challenge?.chargeable === false &&
    challenge?.payment_required_now === false && challenge?.availability?.deliverable === false &&
    challenge?.execution_authorized === false;
  const blockers = [];
  if (!scopeVerified) blockers.push('CATEGORY_DISCOVERY_NOT_VERIFIED');
  if (!mainnet) blockers.push('MAINNET_CONFIGURATION_NOT_VERIFIED');
  if (!mainnetDeliverable) blockers.push(safelyUnavailable ? 'CURRENT_REQUEST_NOT_DELIVERABLE' : 'LIVE_DELIVERABILITY_NOT_VERIFIED');
  return { category: config.category, discovery_http: discovery.status, query_http: query.status,
    scope_verified: scopeVerified, mainnet_configured: mainnet,
    no_funds_deliverability_verified: mainnetDeliverable, safely_unavailable: safelyUnavailable,
    ready_for_no_funds_preflight: blockers.length === 0, blockers };
}

export async function verifyLiveCategories({ origin = 'https://geomacro.live', fetchImpl = fetch } = {}) {
  async function request(path, method) {
    try {
      const response = await fetchImpl(`${origin}${path}`, {
        method, redirect: 'error', signal: AbortSignal.timeout(30_000),
        headers: { 'Accept': 'application/json', ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}) },
        ...(method === 'POST' ? { body: JSON.stringify({
          subjects: [{ type: 'country', country_iso3: 'IND' }], max_age_seconds: 3600, detail: 'compact',
        }) } : {}),
      });
      let body = null;
      try { body = await response.json(); } catch { /* non-JSON is a failure */ }
      return { status: response.status, body };
    } catch { return { status: 0, body: null }; }
  }
  const categories = [];
  for (const config of CATEGORIES) {
    const path = `/api/v1/intelligence/${config.category}`;
    const discovery = await request(path, 'GET');
    const query = await request(path, 'POST');
    categories.push(assessCategory(config, discovery, query, origin));
  }
  return { schema_version: 'geomacro.category-endpoint-no-funds-proof.v1', checked_at: new Date().toISOString(),
    country_iso3: 'IND', requested_max_age_seconds: 3600, payment_signature_sent: false,
    payment_or_settlement_performed: false, execution_authorized: false,
    status: categories.every(c => c.ready_for_no_funds_preflight) ? 'NO_FUNDS_PREFLIGHT_PASS' : 'BLOCKED',
    // One-country challenge checks are not paid delivery, global coverage or SLA acceptance.
    proves_paid_delivery: false, proves_global_coverage: false, categories };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const proof = await verifyLiveCategories();
  await mkdir('artifacts/category-endpoints', { recursive: true });
  await writeFile('artifacts/category-endpoints/no-funds-proof.json', JSON.stringify(proof, null, 2) + '\n');
  console.log(JSON.stringify(proof, null, 2));
  if (proof.status !== 'NO_FUNDS_PREFLIGHT_PASS') process.exitCode = 1;
}
