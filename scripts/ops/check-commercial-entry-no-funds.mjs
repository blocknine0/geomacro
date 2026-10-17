import { mkdir, writeFile } from 'node:fs/promises';
import { readCircleFacilitatorSupport, circleNativeExactKind }
  from '../lib/circle-facilitator-verification.mjs';
import { GEOMACRO_USDC_NATIVE_RAILS } from '../../src/lib/usdc-native-rail-identities.ts';

const expectedSha = process.env.GEOMACRO_EXPECTED_SHA ?? '';
if (!/^[a-f0-9]{40}$/u.test(expectedSha)) throw Error('EXACT_EXPECTED_SHA_REQUIRED');
const country = process.env.GEOMACRO_DIGEST_COUNTRY ?? 'CHN';
if (!/^[A-Z]{3}$/u.test(country)) throw Error('ISO3_COUNTRY_REQUIRED');
const topic = process.env.GEOMACRO_DIGEST_TOPIC ?? 'fx_external_risk';
if (!['macro_risk','sovereign_risk','fx_external_risk','critical_minerals','conflict_geopolitics'].includes(topic))
  throw Error('SUPPORTED_STRUCTURAL_TOPIC_REQUIRED');
const origin = 'https://geomacro.live';
async function probe(path, body) {
  try {
    const response = await fetch(origin + path, { method: body ? 'POST' : 'GET',
      headers: { 'accept': 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), redirect: 'error',
      signal: AbortSignal.timeout(20_000) });
    return { status: response.status, body: await response.json() };
  } catch { return { status: 0, body: null }; }
}
// Read-only probes and a single explicitly nonpayable availability POST.
// No buyer key, seller key, payment signature or settlement API is used.
const [build, health, networks, digest, circle] = await Promise.all([
  probe('/.well-known/geomacro-build.json'), probe('/api/health?deep=1'),
  probe('/api/v1/payments/networks'), probe('/api/v1/intelligence/availability', {
    schema_version: 'geomacro.agent-query.v1', delivery_tier: 'structural_baseline',
    fulfillment_mode: 'published_only', subjects: [{ type: 'country', country_iso3: country }],
    topics: [topic], detail: 'compact',
  }),
  readCircleFacilitatorSupport().then(supported => Object.values(GEOMACRO_USDC_NATIVE_RAILS).map(rail => {
    try { circleNativeExactKind(supported, rail.caip2, rail.asset);
      return { network: rail.caip2, native_exact_supported: true }; }
    catch { return { network: rail.caip2, native_exact_supported: false }; }
  })).catch(() => Object.values(GEOMACRO_USDC_NATIVE_RAILS).map(rail =>
    ({ network: rail.caip2, native_exact_supported: null }))),
]);
const result = {
  schema: 'geomacro.commercial-entry-no-funds.v1', checked_at: new Date().toISOString(),
  expected_sha: expectedSha,
  live_sha: /^[a-f0-9]{40}$/u.test(build.body?.canonical_main_sha ?? '') ? build.body.canonical_main_sha : null,
  exact_website_sha_verified: build.status === 200 && build.body?.canonical_main_sha === expectedSha,
  deep_health_http_status: health.status,
  deep_health_ready: health.status === 200 && health.body?.ok === true,
  current_hot_product_ready: Object.fromEntries(['intelligence','global_risk','risk_indices'].map(key =>
    [key, health.body?.public_production?.current_hot_product_ready?.[key] === true])),
  network_discovery_http_status: networks.status,
  circle_public_support: circle,
  structural_digest: { country, topic, capability: 'structural_country_digest', amount_atomic: '20000',
    availability_http_status: digest.status,
    data_preflight_eligible: digest.status === 200 && digest.body?.ok === true &&
      ['ELIGIBLE_FOR_X402_QUOTE','ELIGIBLE_BUT_PAYMENT_RAIL_LOCKED'].includes(digest.body?.status),
    immutable_customer_bytes_verified: false },
  // Public network support and an availability result cannot establish these.
  merchant_acceptance_verified: false, settlement_delivery_proof_verified: false,
  payment_attempts: 0, settlement_attempts: 0, execution_authorized: false,
  full_commercial_launch_verified: false,
};
await mkdir('artifacts', { recursive: true });
await writeFile('artifacts/commercial-entry-no-funds.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
// An audit is not launch acceptance. A red result must remain visible to CI.
if (!result.exact_website_sha_verified || !result.deep_health_ready ||
    !result.structural_digest.data_preflight_eligible ||
    !circle.every(rail => rail.native_exact_supported === true)) process.exitCode = 1;
