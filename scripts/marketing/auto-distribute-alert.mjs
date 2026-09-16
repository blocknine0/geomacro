import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/, '').split('=');
  return [key, rest.length ? rest.join('=') : true];
}));

const root = process.cwd();
const config = JSON.parse(await fs.readFile(path.join(root, 'config/auto-distribution.json'), 'utf8'));
const inputPath = args.get('input');
if (!inputPath) throw new Error('Missing --input=<alert.json>');

const alert = JSON.parse(await fs.readFile(path.resolve(root, inputPath), 'utf8'));
const dryRun = args.has('live') ? false : config.default_dry_run !== false;
const forcedChannels = String(args.get('channels') || '').split(',').map((x) => x.trim()).filter(Boolean);

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

const contentTypeOkay = config.public_alert_policy.allowed_content_types.includes(contentType);
const visibilityOkay = visibility === config.public_alert_policy.required_visibility;
const statusOkay = config.public_alert_policy.allowed_statuses.includes(status);
const evidenceOkay = Boolean(alert.official_source_present) || evidenceCount >= config.public_alert_policy.minimum_independent_evidence;
const eligible = contentTypeOkay && visibilityOkay && statusOkay && confidence >= config.public_alert_policy.minimum_confidence && evidenceOkay;

if (!eligible && !args.has('force')) {
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
    `Geomacro ${status} · ${alert.country} (${alert.country_iso3})`,
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
    `${alert.country} (${alert.country_iso3})`,
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

async function postJson(url, options) {
  const response = await fetch(url, options);
  const body = await response.text();
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${body.slice(0, 500)}`);
  return body ? JSON.parse(body) : null;
}

async function sendTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return { skipped: 'missing_credentials' };
  return postJson(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: false })
  });
}

async function sendDiscord(text) {
  const webhook = process.env.DISCORD_WEBHOOK_URL;
  if (!webhook) return { skipped: 'missing_credentials' };
  return postJson(`${webhook}${webhook.includes('?') ? '&' : '?'}wait=true`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content: text, allowed_mentions: { parse: [] } })
  });
}

async function sendBluesky(text) {
  const identifier = process.env.BLUESKY_IDENTIFIER;
  const password = process.env.BLUESKY_APP_PASSWORD;
  const service = (process.env.BLUESKY_SERVICE || 'https://bsky.social').replace(/\/$/, '');
  if (!identifier || !password) return { skipped: 'missing_credentials' };
  const session = await postJson(`${service}/xrpc/com.atproto.server.createSession`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identifier, password })
  });
  return postJson(`${service}/xrpc/com.atproto.repo.createRecord`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${session.accessJwt}` },
    body: JSON.stringify({
      repo: session.did,
      collection: 'app.bsky.feed.post',
      record: { $type: 'app.bsky.feed.post', text, createdAt: new Date().toISOString() }
    })
  });
}

async function sendMastodon(text, idempotencyKey) {
  const base = process.env.MASTODON_BASE_URL?.replace(/\/$/, '');
  const token = process.env.MASTODON_ACCESS_TOKEN;
  if (!base || !token) return { skipped: 'missing_credentials' };
  const body = new URLSearchParams({ status: text, visibility: 'public' });
  const response = await fetch(`${base}/api/v1/statuses`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/x-www-form-urlencoded',
      'Idempotency-Key': idempotencyKey
    },
    body
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${raw.slice(0, 500)}`);
  return raw ? JSON.parse(raw) : null;
}

const adapters = { telegram: sendTelegram, discord: sendDiscord, bluesky: sendBluesky, mastodon: sendMastodon };
const channels = forcedChannels.length
  ? forcedChannels
  : Object.entries(config.channels).filter(([, value]) => value.enabled && value.cost_class === 'free').map(([key]) => key);

const output = { alert_id: alert.alert_id, dry_run: dryRun, channels: {} };
for (const channel of channels) {
  if (!adapters[channel]) {
    output.channels[channel] = { skipped: 'unsupported_adapter' };
    continue;
  }
  const text = render(channel);
  const key = crypto.createHash('sha256').update(`${alert.alert_id}:${channel}`).digest('hex');
  if (dryRun) {
    output.channels[channel] = { dry_run: true, idempotency_key: key, text };
    continue;
  }
  try {
    const result = channel === 'mastodon' ? await adapters[channel](text, key) : await adapters[channel](text);
    output.channels[channel] = { ok: !result?.skipped, idempotency_key: key, result };
  } catch (error) {
    output.channels[channel] = { ok: false, idempotency_key: key, error: error.message };
  }
}

console.log(JSON.stringify(output, null, 2));
