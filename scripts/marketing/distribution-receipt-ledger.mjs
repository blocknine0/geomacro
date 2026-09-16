import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const CHANNELS = new Set([
  'telegram',
  'discord',
  'bluesky',
  'mastodon',
  'linkedin',
  'x',
  'rss',
  'webhook',
  'email',
]);

const OUTCOMES = new Set([
  'PUBLISHED',
  'RETRYABLE_FAILURE',
  'AMBIGUOUS',
  'SKIPPED',
]);

function stableJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const object = value;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`)
    .join(',')}}`;
}

function boundedText(value, field, max) {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text || text.length > max) throw new Error(`${field} is invalid`);
  return text;
}

function requiredText(value, field, max) {
  const text = boundedText(value, field, max);
  if (!text) throw new Error(`${field} is required`);
  return text;
}

export function distributionPayloadHash({ alertId, channel, payload }) {
  const normalizedAlertId = requiredText(alertId, 'alertId', 200);
  const normalizedChannel = requiredText(channel, 'channel', 32).toLowerCase();
  if (!CHANNELS.has(normalizedChannel)) throw new Error('unsupported distribution channel');
  if (payload == null) throw new Error('payload is required');

  return createHash('sha256')
    .update(
      stableJson({
        version: 'early-warning-distribution-payload-v1',
        alert_id: normalizedAlertId,
        channel: normalizedChannel,
        payload,
      }),
      'utf8',
    )
    .digest('hex');
}

export function getDistributionServiceClient(env = process.env) {
  const url = env.APP_SUPABASE_URL || env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.APP_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Supabase URL and service-role key are required for distribution receipt writes');
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function singleRow(data, operation) {
  if (!Array.isArray(data) || data.length !== 1 || !data[0] || typeof data[0] !== 'object') {
    throw new Error(`${operation} returned an invalid receipt response`);
  }
  return data[0];
}

export async function claimDistributionReceipt({
  supabase,
  alertId,
  channel,
  payloadHash,
  leaseSeconds = 120,
}) {
  if (!supabase?.rpc) throw new Error('supabase service client is required');
  const normalizedAlertId = requiredText(alertId, 'alertId', 200);
  const normalizedChannel = requiredText(channel, 'channel', 32).toLowerCase();
  if (!CHANNELS.has(normalizedChannel)) throw new Error('unsupported distribution channel');
  if (!/^[0-9a-f]{64}$/.test(String(payloadHash || ''))) {
    throw new Error('payloadHash must be a lowercase SHA-256 hex digest');
  }
  if (!Number.isInteger(leaseSeconds) || leaseSeconds < 30 || leaseSeconds > 600) {
    throw new Error('leaseSeconds must be an integer from 30 to 600');
  }

  const { data, error } = await supabase.rpc('claim_early_warning_distribution', {
    p_alert_key: normalizedAlertId,
    p_channel: normalizedChannel,
    p_payload_hash: payloadHash,
    p_lease_seconds: leaseSeconds,
  });
  if (error) throw new Error(`distribution receipt claim failed: ${error.message || 'unknown error'}`);

  const row = singleRow(data, 'distribution receipt claim');
  if (row.acquired === true && !row.claim_token) {
    throw new Error('acquired distribution receipt is missing claim token');
  }
  return row;
}

export async function finalizeDistributionReceipt({
  supabase,
  receiptId,
  claimToken,
  outcome,
  externalReference = null,
  errorMessage = null,
  responseCode = null,
}) {
  if (!supabase?.rpc) throw new Error('supabase service client is required');
  const normalizedReceiptId = requiredText(receiptId, 'receiptId', 80);
  const normalizedClaimToken = requiredText(claimToken, 'claimToken', 80);
  const normalizedOutcome = requiredText(outcome, 'outcome', 32).toUpperCase();
  if (!OUTCOMES.has(normalizedOutcome)) throw new Error('unsupported distribution outcome');
  const reference = boundedText(externalReference, 'externalReference', 500);
  const failure = boundedText(errorMessage, 'errorMessage', 1000);
  if (responseCode != null && (!Number.isInteger(responseCode) || responseCode < 100 || responseCode > 599)) {
    throw new Error('responseCode must be an HTTP status code');
  }

  const { data, error } = await supabase.rpc('finalize_early_warning_distribution', {
    p_receipt_id: normalizedReceiptId,
    p_claim_token: normalizedClaimToken,
    p_outcome: normalizedOutcome,
    p_external_reference: reference,
    p_error: failure,
    p_response_code: responseCode,
  });
  if (error) throw new Error(`distribution receipt finalize failed: ${error.message || 'unknown error'}`);
  return singleRow(data, 'distribution receipt finalize');
}

export const DISTRIBUTION_RECEIPT_CONTRACT_VERSION = 'early-warning-distribution-lease-v1';
