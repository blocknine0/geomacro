import { describe, expect, it, vi } from 'vitest';
import { assessCategory, CATEGORIES, verifyLiveCategories } from '../../scripts/ops/verify-live-category-endpoints.mjs';
const origin = 'https://geomacro.live';
const config = CATEGORIES[0];
const discovery = { status: 200, body: { ok: true, category: config.category,
  endpoint: `${origin}/api/v1/intelligence/geopolitics`, canonical_endpoint: `${origin}/api/v1/intelligence/query`,
  topics: config.topics, required_modules: config.modules, environment: 'production', network: 'eip155:8453', execution_authorized: false } };
const query = { status: 402, body: { x402Version: 2, resource: { url: `${origin}/api/v1/intelligence/query` },
  accepts: [{ network: 'eip155:8453' }], extensions: { geomacro: { info: { execution_authorized: false } } } } };
describe('category no-funds live proof', () => {
  it('requires scoped discovery and mainnet challenge, never just HTTP 200', () => {
    expect(assessCategory(config, discovery, query, origin).ready_for_no_funds_preflight).toBe(true);
    expect(assessCategory(config, discovery, { status: 200, body: {} }, origin).ready_for_no_funds_preflight).toBe(false);
    const testnet = { ...discovery, body: { ...discovery.body, environment: 'testnet', network: 'eip155:84532' } };
    expect(assessCategory(config, testnet, query, origin).ready_for_no_funds_preflight).toBe(false);
  });
  it('records unavailable as blocked without leaking provider data', () => {
    const result = assessCategory(config, discovery, { status: 422, body: { chargeable: false, payment_required_now: false,
      execution_authorized: false, availability: { deliverable: false }, private_source: 'must-not-appear' } }, origin);
    expect(result.safely_unavailable).toBe(true);
    expect(result.ready_for_no_funds_preflight).toBe(false);
    expect(JSON.stringify(result)).not.toContain('must-not-appear');
  });
  it('never sends payment signatures or retries into redirects', async () => {
    const fetchImpl = vi.fn(async () => Response.json({}, { status: 503 }));
    const result = await verifyLiveCategories({ fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(6);
    for (const [, options] of fetchImpl.mock.calls as unknown as Array<[string, RequestInit]>) {
      expect(new Headers(options.headers).has('payment-signature')).toBe(false);
      expect(options.redirect).toBe('error');
      if (options.method === 'POST') expect(JSON.parse(options.body as string).max_age_seconds).toBe(3600);
    }
    expect(result.status).toBe('BLOCKED');
    expect(result.proves_paid_delivery).toBe(false);
  });
});
