import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

import {
  claimDistributionReceipt,
  DISTRIBUTION_RECEIPT_CONTRACT_VERSION,
  distributionPayloadHash,
  finalizeDistributionReceipt,
  reconcileDistributionReceipt,
} from './distribution-receipt-ledger.mjs';

assert.equal(DISTRIBUTION_RECEIPT_CONTRACT_VERSION, 'early-warning-distribution-lease-v2');

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
    if (name === 'reconcile_early_warning_distribution') {
      return {
        data: [{
          receipt_id: '11111111-1111-4111-8111-111111111111',
          receipt_status: 'RETRYABLE_FAILURE',
          ambiguous_outcome: false,
          published_at: null,
          attempt_count: 1,
          reconciliation_id: '44444444-4444-4444-8444-444444444444',
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

const reconciled = await reconcileDistributionReceipt({
  supabase: fakeSupabase,
  receiptId: claim.receipt_id,
  resolution: 'RETRYABLE_FAILURE',
  actor: 'founder-review',
  note: 'Remote platform confirms no public post exists.',
});
assert.equal(reconciled.ambiguous_outcome, false);
assert.equal(calls[2].name, 'reconcile_early_warning_distribution');
assert.equal(calls[2].params.p_resolution, 'RETRYABLE_FAILURE');
assert.equal(calls[2].params.p_actor, 'founder-review');

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

await assert.rejects(
  () => reconcileDistributionReceipt({
    supabase: fakeSupabase,
    receiptId: claim.receipt_id,
    resolution: 'AMBIGUOUS',
    actor: 'founder-review',
    note: 'This resolution must not be accepted.',
  }),
  /unsupported reconciliation resolution/,
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

const capSql = await fs.readFile('supabase/migrations/941_early_warning_distribution_attempt_cap.sql', 'utf8');
assert.ok(capSql.includes('attempt_count <= 5'), 'receipt ledger must hard-cap delivery attempts at five');

const expiredSql = await fs.readFile('supabase/migrations/942_early_warning_expired_lease_safety.sql', 'utf8');
for (const required of [
  "if v_receipt.lease_token is not null then",
  "v_receipt.lease_expires_at > v_now",
  "ambiguous_outcome = true",
  "expired delivery lease requires manual reconciliation",
  "lease_token = null",
  "lease_expires_at = null",
  "if v_receipt.attempt_count >= 5 then",
  "retry_blocked",
]) {
  assert.ok(expiredSql.includes(required), `expired-lease migration missing safeguard: ${required}`);
}
assert.ok(
  expiredSql.indexOf('ambiguous_outcome = true') < expiredSql.indexOf('v_token := gen_random_uuid()'),
  'expired lease ambiguity must be handled before a new claim token can be issued',
);

const reconcileSql = await fs.readFile('supabase/migrations/943_early_warning_distribution_reconciliation.sql', 'utf8');
for (const required of [
  'early_warning_distribution_reconciliations',
  'reconcile_early_warning_distribution',
  "v_receipt.ambiguous_outcome is not true",
  "v_receipt.lease_token is not null",
  "RETRYABLE_FAILURE",
  "from PUBLIC, anon, authenticated",
  "to service_role",
]) {
  assert.ok(reconcileSql.includes(required), `reconciliation migration missing safeguard: ${required}`);
}

const config = JSON.parse(await fs.readFile('config/auto-distribution.json', 'utf8'));
assert.equal(config.mode, 'prelaunch-shadow');
assert.equal(config.live_publish_enabled, false);
assert.equal(config.receipt_policy.contract_version, DISTRIBUTION_RECEIPT_CONTRACT_VERSION);
assert.equal(config.receipt_policy.lease_seconds, 120);
assert.equal(config.receipt_policy.max_attempts_per_alert_channel, 5);
assert.equal(config.receipt_policy.ambiguous_outcome_retry, 'manual_only');
assert.equal(config.receipt_policy.expired_claim_retry, 'manual_only');
assert.equal(config.receipt_policy.reconcile_rpc, 'reconcile_early_warning_distribution');
assert.equal(config.receipt_policy.live_worker_wired, false);

console.log('PASS: Early Warning distribution lease, expired-claim, and reconciliation contract is fail-closed.');
