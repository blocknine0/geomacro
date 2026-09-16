import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

import {
  claimDistributionReceipt,
  distributionPayloadHash,
  finalizeDistributionReceipt,
  getDistributionServiceClient,
} from './distribution-receipt-ledger.mjs';

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/, '').split('=');
  return [key, rest.length ? rest.join('=') : true];
}));

const root = process.cwd();
const config = JSON.parse(await fs.readFile(path.join(root, 'config/auto-distribution.json'), 'utf8'));
const inputPath = args.get('input');
if (!inputPath) throw new Error('Missing --input=<alert.json>');

const alert = JSON.parse(await fs.readFile(path.resolve(root, inputPath), 'utf8'));
const requestedLive = args.has('live');
const receiptPolicy = config.receipt_policy || {};
const ownerAckEnv = receiptPolicy.owner_launch_ack_env || 'GEOMACRO_EARLY_WARNING_DISTRIBUTION_ACK';
const ownerAckValue = receiptPolicy.owner_launch_ack_value || 'I_AUTHORIZE_PUBLIC_EARLY_WARNING_DISTRIBUTION';

if (requestedLive && !args.has('canonical-feed-live')) {
  throw new Error('Live public distribution may only run through the canonical public-feed poller');
}
if (requestedLive && config.live_publish_enabled !== true) {
  throw new Error('Live public distribution is disabled by config/auto-distribution.json');
}
if (requestedLive && receiptPolicy.live_worker_wired !== true) {
  throw new Error('Live public distribution worker is not marked as receipt-ledger wired');
}
if (requestedLive && process.env[ownerAckEnv] !== ownerAckValue) {
  throw new Error(`Live public distribution requires explicit owner authorization via ${ownerAckEnv}`);
}

const dryRun = !requestedLive;
const requestedChannels = String(args.get('channels') || '').split(',').map((x) => x.trim()).filter(Boolean);

function requireField(name) {
  const value = alert[name];
  if (value === undefined || value === null || value === '') throw new Error(`Missing alert field: ${name}`);
  return value;
}

for (const field of [
  'alert_id',
  'content_type',
  'visibility',
  'country',
  'country_iso3',
  'status',
  'confidence',
  'event_title',
  'primary_cause',
  'detected_at_utc',
  'country_timezone',
  'detected_at_local'
]) requireField(field);

const contentType = String(alert.content_type).toLowerCase();
const visibility = String(alert.visibility).toLowerCase();
const status = String(alert.status).toUpperCase();
const confidence = Number(alert.confidence);
const evidenceCount = Number(alert.independent_evidence_count || 0);
const iso3 = String(alert.country_iso3).toUpperCase();

if (!/^[A-Z]{3}$/.test(iso3)) throw new Error('country_iso3 must be a three-letter ISO-style code');
if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) throw new Error('confidence must be between 0 and 1');
if (!Number.isInteger(evidenceCount) || evidenceCount < 0) throw new Error('independent_evidence_count must be a non-negative integer');
if (!Number.isFinite(Date.parse(alert.detected_at_utc))) throw new Error('detected_at_utc must be a valid ISO timestamp');
if (!Number.isFinite(Date.parse(alert.detected_at_local))) throw new Error('detected_at_local must be a valid ISO timestamp');
try {
  new Intl.DateTimeFormat('en-US', { timeZone: alert.country_timezone }).format(new Date(alert.detected_at_utc));
} catch {
  throw new Error('country_timezone must be a valid IANA timezone');
}

const contentTypeOkay = config.public_alert_policy.allowed_content_types.includes(contentType);
const visibilityOkay = visibility === config.public_alert_policy.required_visibility;
const statusOkay = config.public_alert_policy.allowed_statuses.includes(status);
const evidenceRequired = config.public_alert_policy.require_official_or_independent_confirmation !== false;
const evidenceOkay = !evidenceRequired || Boolean(alert.official_source_present) || evidenceCount >= config.public_alert_policy.minimum_independent_evidence;
const eligible = contentTypeOkay && visibilityOkay && statusOkay && confidence >= config.public_alert_policy.minimum_confidence && evidenceOkay;

if (!eligible) {
  console.log(JSON.stringify({
    published: false,
    reason: 'alert_not_publicly_eligible',
    contentType,
    visibility,
    status,
    confidence,
    evidenceCount
  }, null, 2));
  process.exit(0);
}

if (contentType !== 'early_warning') {
  throw new Error('Only early_warning content may use the automatic public distributor');
}

const prohibited = new Set(config.public_alert_policy.never_publish_fields || []);
for (const field of prohibited) delete alert[field];

const localTime = `${alert.detected_at_local} (${alert.country_timezone})`;
const relevance = alert.market_relevance || {};
const relevantAssets = Object.entries(relevance)
  .filter(([, value]) => value && String(value).toUpperCase() !== 'LOW')
  .map(([key, value]) => `${key}: ${String(value).toUpperCase()}`)
  .slice(0, 4);
const transmission = Array.isArray(alert.transmission_channels) ? alert.transmission_channels.slice(0, 4) : [];
const url = alert.public_url || 'https://geomacro.live';

function truncate(text, max) {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function compactBase() {
  return [
    `Geomacro ${status} · ${alert.country} (${iso3})`,
    alert.event_title,
    `Cause: ${alert.primary_cause}`,
    relevantAssets.length ? `Relevance: ${relevantAssets.join(' · ')}` : null,
    `Confidence: ${Math.round(confidence * 100)}%`,
    `Detected: ${localTime}`,
    `UTC: ${alert.detected_at_utc}`,
    url
  ].filter(Boolean).join('\n');
}

function detailedBase() {
  return [
    `GEOMACRO EARLY WARNING · ${status}`,
    `${alert.country} (${iso3})`,
    '',
    alert.event_title,
    '',
    `Cause: ${alert.primary_cause}`,
    transmission.length ? `Transmission: ${transmission.join(' → ')}` : null,
    relevantAssets.length ? `Market relevance: ${relevantAssets.join(' · ')}` : null,
    `Confidence: ${Math.round(confidence * 100)}%`,
    `Evidence: ${evidenceCount} independent${alert.official_source_present ? ' · official source present' : ''}`,
    '',
    `First detected: ${localTime}`,
    `UTC: ${alert.detected_at_utc}`,
    '',
    'Structured risk intelligence, not a buy/sell signal.',
    url
  ].filter((x) => x !== null).join('\n');
}

function render(channel) {
  const max = config.channels[channel]?.max_chars || 500;
  return truncate(channel === 'telegram' || channel === 'discord' ? detailedBase() : compactBase(), max);
}

class DeliveryError extends Error {
  constructor(message, { outcome = 'AMBIGUOUS', responseCode = null } = {}) {
    super(message);
    this.name = 'DeliveryError';
    this.outcome = outcome;
    this.responseCode = responseCode;
  }
}

function classifyHttpFailure(statusCode, externalWrite) {
  if (!externalWrite) {
    return statusCode === 429 || statusCode >= 500 ? 'RETRYABLE_FAILURE' : 'SKIPPED';
  }
  if (statusCode === 429) return 'RETRYABLE_FAILURE';
  if (statusCode === 408 || statusCode === 425 || statusCode >= 500) return 'AMBIGUOUS';
  return 'SKIPPED';
}

async function postJson(url, options, { externalWrite = false } = {}) {
  let response;
  try {
    response = await fetch(url, options);
  } catch (error) {
    throw new DeliveryError(
      `${externalWrite ? 'external write' : 'request'} transport failure: ${error?.message || String(error)}`,
      { outcome: externalWrite ? 'AMBIGUOUS' : 'RETRYABLE_FAILURE' },
    );
  }

  let body;
  try {
    body = await response.text();
  } catch (error) {
    throw new DeliveryError(
      `failed reading ${response.status} response body: ${error?.message || String(error)}`,
      {
        outcome: externalWrite && response.ok ? 'AMBIGUOUS' : classifyHttpFailure(response.status, externalWrite),
        responseCode: response.status,
      },
    );
  }

  if (!response.ok) {
    throw new DeliveryError(
      `${response.status} ${response.statusText}: ${body.slice(0, 500)}`,
      { outcome: classifyHttpFailure(response.status, externalWrite), responseCode: response.status },
    );
  }

  if (!body) return { data: null, responseCode: response.status };
  try {
    return { data: JSON.parse(body), responseCode: response.status };
  } catch (error) {
    throw new DeliveryError(
      `successful response was not valid JSON: ${error?.message || String(error)}`,
      { outcome: externalWrite ? 'AMBIGUOUS' : 'RETRYABLE_FAILURE', responseCode: response.status },
    );
  }
}

function missingCredentials(channel) {
  const required = {
    telegram: ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'],
    discord: ['DISCORD_WEBHOOK_URL'],
    bluesky: ['BLUESKY_IDENTIFIER', 'BLUESKY_APP_PASSWORD'],
    mastodon: ['MASTODON_BASE_URL', 'MASTODON_ACCESS_TOKEN'],
  }[channel] || [];
  return required.filter((name) => !process.env[name]);
}

function destinationFingerprint(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex').slice(0, 16);
}

function payloadFor(channel, text) {
  if (channel === 'telegram') {
    return {
      text,
      disable_web_page_preview: false,
      destination_fingerprint: destinationFingerprint(process.env.TELEGRAM_CHAT_ID),
    };
  }
  if (channel === 'discord') {
    return {
      content: text,
      allowed_mentions: { parse: [] },
      destination_fingerprint: destinationFingerprint(process.env.DISCORD_WEBHOOK_URL),
    };
  }
  if (channel === 'bluesky') {
    return {
      text,
      identifier: process.env.BLUESKY_IDENTIFIER || null,
      service: (process.env.BLUESKY_SERVICE || 'https://bsky.social').replace(/\/$/, ''),
    };
  }
  if (channel === 'mastodon') {
    return {
      status: text,
      visibility: 'public',
      destination_fingerprint: destinationFingerprint(process.env.MASTODON_BASE_URL),
    };
  }
  return { text };
}

async function sendTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const response = await postJson(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: false })
  }, { externalWrite: true });
  if (response.data?.ok !== true) {
    throw new DeliveryError('Telegram did not confirm message publication', {
      outcome: 'AMBIGUOUS',
      responseCode: response.responseCode,
    });
  }
  return response;
}

async function sendDiscord(text) {
  const webhook = process.env.DISCORD_WEBHOOK_URL;
  return postJson(`${webhook}${webhook.includes('?') ? '&' : '?'}wait=true`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content: text, allowed_mentions: { parse: [] } })
  }, { externalWrite: true });
}

async function sendBluesky(text) {
  const identifier = process.env.BLUESKY_IDENTIFIER;
  const password = process.env.BLUESKY_APP_PASSWORD;
  const service = (process.env.BLUESKY_SERVICE || 'https://bsky.social').replace(/\/$/, '');
  const session = await postJson(`${service}/xrpc/com.atproto.server.createSession`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identifier, password })
  });
  if (!session.data?.accessJwt || !session.data?.did) {
    throw new DeliveryError('Bluesky session response is incomplete', {
      outcome: 'RETRYABLE_FAILURE',
      responseCode: session.responseCode,
    });
  }
  return postJson(`${service}/xrpc/com.atproto.repo.createRecord`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${session.data.accessJwt}` },
    body: JSON.stringify({
      repo: session.data.did,
      collection: 'app.bsky.feed.post',
      record: { $type: 'app.bsky.feed.post', text, createdAt: new Date().toISOString() }
    })
  }, { externalWrite: true });
}

async function sendMastodon(text, idempotencyKey) {
  const base = process.env.MASTODON_BASE_URL?.replace(/\/$/, '');
  const token = process.env.MASTODON_ACCESS_TOKEN;
  const body = new URLSearchParams({ status: text, visibility: 'public' });
  return postJson(`${base}/api/v1/statuses`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/x-www-form-urlencoded',
      'Idempotency-Key': idempotencyKey
    },
    body
  }, { externalWrite: true });
}

function externalReference(channel, response) {
  const data = response?.data;
  if (channel === 'telegram') {
    const result = data?.result;
    if (result?.message_id != null) return `telegram:${result.chat?.id ?? 'chat'}:${result.message_id}`;
  }
  if (channel === 'discord' && data?.id) return `discord:${data.id}`;
  if (channel === 'bluesky' && data?.uri) return data.uri;
  if (channel === 'mastodon') return data?.uri || data?.url || (data?.id ? `mastodon:${data.id}` : null);
  return null;
}

const adapters = { telegram: sendTelegram, discord: sendDiscord, bluesky: sendBluesky, mastodon: sendMastodon };
const defaultChannels = Object.entries(config.channels)
  .filter(([, value]) => value.enabled && value.cost_class === 'free' && value.publish_mode !== 'native_public_feed')
  .map(([key]) => key);
const channels = requestedChannels.length ? requestedChannels : defaultChannels;

if (requestedLive) {
  for (const channel of channels) {
    const channelPolicy = config.channels[channel];
    if (!channelPolicy || channelPolicy.enabled !== true || channelPolicy.cost_class !== 'free' || !adapters[channel]) continue;
    const missing = missingCredentials(channel);
    if (missing.length) {
      throw new Error(`Live ${channel} distribution is missing protected credential(s): ${missing.join(', ')}`);
    }
  }
}

const supabase = requestedLive ? await getDistributionServiceClient() : null;
const leaseSeconds = Number(receiptPolicy.lease_seconds || 120);
const output = { alert_id: alert.alert_id, dry_run: dryRun, receipt_ledger_wired: receiptPolicy.live_worker_wired === true, channels: {} };
let hadLiveFailure = false;

for (const channel of channels) {
  const channelPolicy = config.channels[channel];
  if (!channelPolicy || channelPolicy.enabled !== true || channelPolicy.cost_class !== 'free') {
    output.channels[channel] = { skipped: 'channel_not_enabled_for_free_distribution' };
    continue;
  }
  if (channelPolicy.publish_mode === 'native_public_feed') {
    output.channels[channel] = { skipped: 'native_public_feed_no_push_receipt_required' };
    continue;
  }
  if (!adapters[channel]) {
    output.channels[channel] = { skipped: 'unsupported_adapter' };
    continue;
  }

  const text = render(channel);
  const payload = payloadFor(channel, text);
  const idempotencyKey = crypto.createHash('sha256').update(`${alert.alert_id}:${channel}`).digest('hex');
  const payloadHash = distributionPayloadHash({ alertId: alert.alert_id, channel, payload });

  if (dryRun) {
    output.channels[channel] = {
      dry_run: true,
      idempotency_key: idempotencyKey,
      payload_hash: payloadHash,
      text,
    };
    continue;
  }

  let claim;
  try {
    claim = await claimDistributionReceipt({
      supabase,
      alertId: alert.alert_id,
      channel,
      payloadHash,
      leaseSeconds,
    });
  } catch (error) {
    output.channels[channel] = {
      ok: false,
      stage: 'receipt_claim',
      idempotency_key: idempotencyKey,
      payload_hash: payloadHash,
      error: error?.message || String(error),
    };
    hadLiveFailure = true;
    continue;
  }

  if (claim.acquired !== true) {
    output.channels[channel] = {
      ok: claim.already_published === true,
      deduplicated: claim.already_published === true,
      retry_blocked: claim.retry_blocked === true,
      receipt_id: claim.receipt_id,
      receipt_status: claim.receipt_status,
      attempt_count: claim.attempt_count,
      idempotency_key: idempotencyKey,
      payload_hash: payloadHash,
    };
    if (claim.already_published !== true) hadLiveFailure = true;
    continue;
  }

  let delivery;
  try {
    delivery = channel === 'mastodon'
      ? await adapters[channel](text, idempotencyKey)
      : await adapters[channel](text);
  } catch (error) {
    const outcome = error instanceof DeliveryError ? error.outcome : 'AMBIGUOUS';
    const responseCode = error instanceof DeliveryError ? error.responseCode : null;
    let finalized = null;
    let finalizeError = null;
    try {
      finalized = await finalizeDistributionReceipt({
        supabase,
        receiptId: claim.receipt_id,
        claimToken: claim.claim_token,
        outcome,
        errorMessage: error?.message || String(error),
        responseCode,
      });
    } catch (receiptError) {
      finalizeError = receiptError?.message || String(receiptError);
    }
    output.channels[channel] = {
      ok: false,
      stage: 'external_write',
      receipt_id: claim.receipt_id,
      attempt_count: claim.attempt_count,
      idempotency_key: idempotencyKey,
      payload_hash: payloadHash,
      outcome,
      response_code: responseCode,
      error: error?.message || String(error),
      receipt_finalize_error: finalizeError,
      receipt_status: finalized?.receipt_status || null,
      manual_reconciliation_required: outcome === 'AMBIGUOUS' || Boolean(finalizeError),
    };
    hadLiveFailure = true;
    continue;
  }

  const reference = externalReference(channel, delivery);
  try {
    const finalized = await finalizeDistributionReceipt({
      supabase,
      receiptId: claim.receipt_id,
      claimToken: claim.claim_token,
      outcome: 'PUBLISHED',
      externalReference: reference,
      responseCode: delivery.responseCode,
    });
    output.channels[channel] = {
      ok: true,
      receipt_id: claim.receipt_id,
      receipt_status: finalized.receipt_status,
      published_at: finalized.published_at,
      attempt_count: finalized.attempt_count,
      idempotency_key: idempotencyKey,
      payload_hash: payloadHash,
      external_reference: reference,
      response_code: delivery.responseCode,
    };
  } catch (error) {
    let ambiguityRecorded = false;
    let ambiguityRecordError = null;
    try {
      const ambiguous = await finalizeDistributionReceipt({
        supabase,
        receiptId: claim.receipt_id,
        claimToken: claim.claim_token,
        outcome: 'AMBIGUOUS',
        externalReference: reference,
        errorMessage: `External write returned success but PUBLISHED receipt finalization failed: ${error?.message || String(error)}`,
        responseCode: delivery.responseCode,
      });
      ambiguityRecorded = ambiguous.ambiguous_outcome === true;
    } catch (receiptError) {
      ambiguityRecordError = receiptError?.message || String(receiptError);
    }
    output.channels[channel] = {
      ok: false,
      stage: 'receipt_finalize_after_external_success',
      receipt_id: claim.receipt_id,
      attempt_count: claim.attempt_count,
      idempotency_key: idempotencyKey,
      payload_hash: payloadHash,
      external_reference: reference,
      response_code: delivery.responseCode,
      error: error?.message || String(error),
      ambiguity_recorded: ambiguityRecorded,
      ambiguity_record_error: ambiguityRecordError,
      manual_reconciliation_required: true,
    };
    hadLiveFailure = true;
  }
}

console.log(JSON.stringify(output, null, 2));
if (requestedLive && hadLiveFailure) process.exitCode = 1;
