import { describe, expect, it } from 'vitest';

const RESOURCE_URL = 'https://geomacro.live/api/x402/risk';
const VALIDATOR_URL = 'https://api.cdp.coinbase.com/platform/v2/x402/validate';
const EXPECTED_NETWORK = 'eip155:84532';
const EXPECTED_USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';

function decodeBase64Json(value: string): unknown {
  return JSON.parse(Buffer.from(value, 'base64').toString('utf8'));
}

describe('live Coinbase x402 Base Sepolia acceptance', () => {
  it(
    'publishes the expected testnet readiness manifest',
    async () => {
      const response = await fetch(RESOURCE_URL, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(20_000),
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as Record<string, unknown>;

      expect(data.ok).toBe(true);
      expect(data.environment).toBe('testnet');
      expect(data.network).toBe(EXPECTED_NETWORK);
      expect(data.asset).toBe('USDC');
      expect(data.facilitator).toBe('Coinbase CDP');
      expect(data.execution_authorized).toBe(false);
    },
    30_000,
  );

  it(
    'returns a Base Sepolia USDC 402 challenge with Bazaar metadata',
    async () => {
      const response = await fetch(RESOURCE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: { type: 'country', country_iso3: 'USA' },
          policy_preset: 'balanced',
          action_type: 'agent_payment',
          amount_usdc: 1000,
          client_request_id: 'ci-live-coinbase-x402-acceptance',
        }),
        signal: AbortSignal.timeout(20_000),
      });

      expect(response.status).toBe(402);
      const encoded = response.headers.get('payment-required');
      expect(encoded).toBeTruthy();

      const required = decodeBase64Json(encoded!) as {
        x402Version?: number;
        resource?: { url?: string };
        accepts?: Array<{
          scheme?: string;
          network?: string;
          asset?: string;
          amount?: string;
          payTo?: string;
          maxTimeoutSeconds?: number;
          extra?: { name?: string; version?: string };
        }>;
        extensions?: {
          bazaar?: {
            info?: { input?: { type?: string; method?: string; bodyType?: string; body?: unknown } };
            schema?: { properties?: { input?: { required?: string[] } } };
          };
        };
      };

      expect(required.x402Version).toBe(2);
      expect(required.resource?.url).toBe(RESOURCE_URL);
      expect(required.accepts).toHaveLength(1);

      const accepted = required.accepts![0];
      expect(accepted.scheme).toBe('exact');
      expect(accepted.network).toBe(EXPECTED_NETWORK);
      expect(accepted.asset?.toLowerCase()).toBe(EXPECTED_USDC.toLowerCase());
      expect(accepted.payTo).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(accepted.amount).toMatch(/^[1-9][0-9]*$/);
      expect(accepted.maxTimeoutSeconds).toBe(60);
      expect(accepted.extra).toMatchObject({ name: 'USDC', version: '2' });

      const bazaar = required.extensions?.bazaar;
      expect(bazaar?.info?.input?.type).toBe('http');
      expect(bazaar?.info?.input?.method).toBe('POST');
      expect(bazaar?.info?.input?.bodyType).toBe('json');
      expect(bazaar?.info?.input?.body).toBeTruthy();
      expect(bazaar?.schema?.properties?.input?.required).toEqual(
        expect.arrayContaining(['type', 'method', 'bodyType', 'body']),
      );
    },
    30_000,
  );

  it(
    'is accepted by the Coinbase public x402 validator',
    async () => {
      const response = await fetch(VALIDATOR_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource: RESOURCE_URL, method: 'POST' }),
        signal: AbortSignal.timeout(30_000),
      });

      expect(response.ok).toBe(true);
      const data = (await response.json()) as {
        valid?: boolean;
        simulation?: { outcome?: string };
      };

      expect(data.valid).toBe(true);
      expect(data.simulation?.outcome).toBe('accepted');
    },
    40_000,
  );
});
