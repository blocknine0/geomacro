import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(
  path.resolve('src/routes/api.x402.risk.ts'),
  'utf8',
);

describe('Coinbase x402 validator discovery ordering', () => {
  it('returns x402 discovery requirements for an unpaid schema-invalid probe', () => {
    const zodCatch = source.indexOf('if (error instanceof ZodError)');
    const unpaidDiscovery = source.indexOf(
      'if (!request.headers.get("payment-signature"))',
      zodCatch,
    );
    const paidValidationError = source.indexOf(
      'code: "INVALID_AGENT_REQUEST"',
      unpaidDiscovery,
    );

    expect(zodCatch).toBeGreaterThan(-1);
    expect(unpaidDiscovery).toBeGreaterThan(zodCatch);
    expect(paidValidationError).toBeGreaterThan(unpaidDiscovery);
    expect(
      source.slice(unpaidDiscovery, paidValidationError),
    ).toContain('return paymentRequiredResponse(request, config)');
  });

  it('keeps schema-invalid paid requests fail-closed before settlement', () => {
    const unpaidDiscovery = source.indexOf(
      'if (!request.headers.get("payment-signature"))',
    );
    const paidValidationError = source.indexOf(
      'code: "INVALID_AGENT_REQUEST"',
      unpaidDiscovery,
    );
    const paymentDecode = source.indexOf(
      'paymentPayload = decodeCoinbasePaymentHeader(paymentHeader)',
    );

    expect(paidValidationError).toBeGreaterThan(unpaidDiscovery);
    expect(paymentDecode).toBeGreaterThan(paidValidationError);
    expect(source.slice(paidValidationError, paymentDecode)).toContain('400');
  });
});
