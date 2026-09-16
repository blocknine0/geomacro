import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

import {
  claimDistributionReceipt,
  DISTRIBUTION_RECEIPT_CONTRACT_VERSION,
  distributionPayloadHash,
  finalizeDistributionReceipt,
} from './distribution-receipt-ledger.mjs';

assert.equal(DISTRIBUTION_RECEIPT_CONTRACT_VERSION, 'early-warning-distribution-lease-v1');

const firstHash = distributionPayloadHash({
  alertId: 'sample-alert-001',
  channel: 'telegram',
  payload: { text: 'hello', meta: { b: 2, a: 1 } },
});
const reorderedHash = distributionPayloadHash({
  alertId: 'sample-alert-001',
  channel: 'telegram',
  payload: { meta: { a: 1, b: 2 }, text: 'hello' },
});
const otherChannelHash = distributionPayloadHash({
  alertId: 'sample-alert-001',
  channel: 'discord',
  payload: { text: 'hello', meta: { a: 1, b: 2 } },
});

assert.match(firstHash, /^[0-9a-f]{64}$/);
assert.equal(firstHash, reorderedHash, 'payload hashing must be key-order independent');
assert.notEqual(firstHash, otherChannelHash, 'channel must be bound into the payload hash');

const calls = [];
const fakeSupabase = {
  async rpc(name, params) {
    calls.push({ name, params });
    if (name === 'claim_early_warning_distribution') {
      return {
        data: [{
          receipt_id: '11111111-1111-4111-8111-111111111111',
          early_warning_alert_id: '22222222-2222-4222-8222-222222222222',
          claim_token: '33333333-3333-4333-8333-333333333333',
          acquired: true,
          receipt_status: 'PENDING',
          already_published: false,
          retry_blocked: false,
          attempt_count: 1,
        }],
        error: null,
      };
    }
    if (name === 'finalize_early_warning_distribution') {
      return {
        data: [{
          receipt_id: '11111111-1111-4111-8111-111111111111',
          receipt_status: 'PUBLISHED',
          published_at: '2026-09-16T18:45:00Z',
          ambiguous_outcome: false,
          attempt_count: 1,
        }],
        error: null,
      };
    }
    throw new Error(`unexpected RPC ${name}`);
  },
};

const claim = await claimDistributionReceipt({
  supabase: fakeSupabase,
  alertId: 'sample-alert-001',
  channel: 'telegram',
  payloadHash: firstHash,
  leaseSeconds: 120,
});
assert.equal(claim.acquired, true);
assert.equal(calls[0].name, 'claim_early_warning_distribution');
assert.equal(calls[0].params.p_alert_key, 'sample-alert-001');
assert.equal(calls[0].params.p_channel, 'telegram');
assert.equal(calls[0].params.p_payload_hash, firstHash);
assert.equal(calls[0].params.p_lease_seconds, 120);

const finalized = await finalizeDistributionReceipt({
  supabase: fakeSupabase,
  receiptId: claim.receipt_id,
  claimToken: claim.claim_token,
  outcome: 'PUBLISHED',
  externalReference: 'telegram-message-123',
  responseCode: 200,
});
assert.equal(finalized.receipt_status, 'PUBLISHED');
assert.equal(calls[1].name, 'finalize_early_warning_distribution');
assert.equal(calls[1].params.p_outcome, 'PUBLISHED');

await assert.rejects(
  () => claimDistributionReceipt({
    supabase: fakeSupabase,
    alertId: 'sample-alert-001',
    channel: 'telegram',
    payloadHash: 'bad',
  }),
  /payloadHash/,
);

await assert.rejects(
  () => finalizeDistributionReceipt({
    supabase: fakeSupabase,
    receiptId: claim.receipt_id,
    claimToken: claim.claim_token,
    outcome: 'UNKNOWN',
  }),
  /unsupported distribution outcome/,
);

const sql = await fs.readFile('supabase/migrations/940_early_warning_distribution_claims.sql', 'utf8');
for (const required of [
  'claim_early_warning_distribution',
  'finalize_early_warning_distribution',
  'for update',
  'lease_token',
  'lease_expires_at',
  'payload_hash',
  'ambiguous_outcome',
  "p_outcome = 'AMBIGUOUS'",
  'set search_path = public, extensions',
  'from PUBLIC, anon, authenticated',
  'to service_role',
]) {
  assert.ok(sql.includes(required), `migration missing receipt safeguard: ${required}`);
}
assert.ok(
  sql.includes("visibility = 'public'") &&
    sql.includes('public_eligible is true') &&
    sql.includes('published_at_utc is not null'),
  'claim RPC must only admit already-published public-eligible alerts',
);
assert.ok(
  !sql.includes('grant execute on function public.claim_early_warning_distribution(text, text, text, integer)\n  to anon') &&
    !sql.includes('grant execute on function public.claim_early_warning_distribution(text, text, text, integer)\n  to authenticated'),
  'claim RPC must remain service-role only',
);

const capSql = await fs.readFile('supabase/migrations/941_early_warning_distribution_attempt_cap.sql', 'utf8');
assert.ok(capSql.includes('attempt_count <= 5'), 'receipt ledger must hard-cap delivery attempts at five');

const config = JSON.parse(await fs.readFile('config/auto-distribution.json', 'utf8'));
assert.equal(config.mode, 'prelaunch-shadow');
assert.equal(config.live_publish_enabled, false);
assert.equal(config.receipt_policy.contract_version, DISTRIBUTION_RECEIPT_CONTRACT_VERSION);
assert.equal(config.receipt_policy.lease_seconds, 120);
assert.equal(config.receipt_policy.max_attempts_per_alert_channel, 5);
assert.equal(config.receipt_policy.ambiguous_outcome_retry, 'manual_only');
assert.equal(config.receipt_policy.live_worker_wired, false);

console.log('PASS: Early Warning distribution receipt lease/idempotency contract is fail-closed.');
