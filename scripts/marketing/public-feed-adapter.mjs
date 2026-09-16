const PUBLIC_FEED_VERSION = 'geomacro.public-early-warning-feed.v1';
const EARLY_WARNING_SCHEMA_VERSION = 'early-warning-1.0';
const CEWS_METHOD_VERSION = 'cews-v0.1.0-provisional';
const PUBLIC_STATUSES = new Set(['WARNING', 'CRITICAL']);

function asRecord(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
  return value;
}

function nonEmpty(value, field, max = 1000) {
  const text = String(value ?? '').trim();
  if (!text || text.length > max) throw new Error(`${field} is invalid`);
  return text;
}

function finite(value, field, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new Error(`${field} is out of range`);
  }
  return number;
}

function nonNegativeInteger(value, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) throw new Error(`${field} is invalid`);
  return number;
}

function iso(value, field) {
  const text = nonEmpty(value, field, 80);
  if (!Number.isFinite(Date.parse(text))) throw new Error(`${field} must be an ISO timestamp`);
  return text;
}

function canonicalPublicUrl(value) {
  if (!value) return 'https://geomacro.live';
  const url = new URL(nonEmpty(value, 'public_url', 500));
  if (url.protocol !== 'https:' || url.hostname !== 'geomacro.live') {
    throw new Error('public_url must use https://geomacro.live');
  }
  return url.toString();
}

function assertFeedBoundaries(boundaries) {
  const value = asRecord(boundaries, 'feed.boundaries');
  if (
    value.informational_decision_support !== true ||
    value.structural_pressure_only !== true ||
    value.market_price_prediction !== false ||
    value.trading_instruction !== false ||
    value.performance_claim !== false
  ) {
    throw new Error('feed safety boundaries mismatch');
  }
}

function assertItemBoundaries(boundaries) {
  const value = asRecord(boundaries, 'item.boundaries');
  if (
    value.structural_pressure_only !== true ||
    value.market_price_prediction !== false ||
    value.trading_instruction !== false ||
    value.public_performance_claims_allowed !== false
  ) {
    throw new Error('item safety boundaries mismatch');
  }
}

export function validatePublicEarlyWarningFeed(raw) {
  const feed = asRecord(raw, 'feed');
  if (feed.feed_schema_version !== PUBLIC_FEED_VERSION) {
    throw new Error('public feed schema version mismatch');
  }
  assertFeedBoundaries(feed.boundaries);
  if (!Array.isArray(feed.items) || feed.items.length > 25) {
    throw new Error('public feed items are invalid');
  }
  if (Number(feed.count) !== feed.items.length) {
    throw new Error('public feed count mismatch');
  }
  if (!Number.isFinite(Date.parse(nonEmpty(feed.generated_at_utc, 'generated_at_utc', 80)))) {
    throw new Error('generated_at_utc must be an ISO timestamp');
  }
  return feed;
}

export function normalizePublicFeedItem(raw) {
  const item = asRecord(raw, 'item');
  if (item.schema_version !== EARLY_WARNING_SCHEMA_VERSION) {
    throw new Error('early warning schema version mismatch');
  }
  assertItemBoundaries(item.boundaries);

  const country = asRecord(item.country, 'country');
  const event = asRecord(item.event, 'event');
  const warning = asRecord(item.early_warning, 'early_warning');
  const timestamps = asRecord(item.timestamps, 'timestamps');

  const countryIso3 = nonEmpty(country.iso3, 'country.iso3', 3).toUpperCase();
  if (!/^[A-Z]{3}$/.test(countryIso3)) throw new Error('country.iso3 must be ISO3');
  const timezone = nonEmpty(country.local_timezone, 'country.local_timezone', 80);
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
  } catch {
    throw new Error('country.local_timezone must be a valid IANA timezone');
  }

  const status = nonEmpty(warning.status, 'early_warning.status', 20).toUpperCase();
  if (!PUBLIC_STATUSES.has(status)) throw new Error('early warning status is not distributable');
  if (warning.methodology_version !== CEWS_METHOD_VERSION || warning.methodology_calibrated !== false) {
    throw new Error('CEWS methodology boundary mismatch');
  }

  const confidence = finite(warning.confidence, 'early_warning.confidence', 0, 1);
  const evidenceCount = nonNegativeInteger(
    warning.independent_evidence_count,
    'early_warning.independent_evidence_count',
  );
  const detectedAtUtc = iso(timestamps.detected_at_utc, 'timestamps.detected_at_utc');
  const detectedAtLocal = iso(timestamps.detected_at_local, 'timestamps.detected_at_local');
  const publishedAtUtc = iso(timestamps.published_at_utc, 'timestamps.published_at_utc');
  if (Date.parse(publishedAtUtc) < Date.parse(detectedAtUtc)) {
    throw new Error('published_at_utc cannot precede detected_at_utc');
  }

  const transmission = Array.isArray(item.transmission_channels)
    ? item.transmission_channels.map((value) => nonEmpty(value, 'transmission_channels', 120))
    : (() => { throw new Error('transmission_channels must be an array'); })();
  if (new Set(transmission).size !== transmission.length) {
    throw new Error('transmission_channels contains duplicates');
  }

  const relevanceSource = asRecord(item.market_relevance, 'market_relevance');
  const marketRelevance = Object.fromEntries(
    Object.entries(relevanceSource).map(([key, value]) => [
      nonEmpty(key, 'market_relevance key', 40).toLowerCase(),
      nonEmpty(value, `market_relevance.${key}`, 20).toUpperCase(),
    ]),
  );

  return {
    alert_id: nonEmpty(item.alert_key, 'alert_key', 200),
    content_type: 'early_warning',
    visibility: 'public',
    country: nonEmpty(country.name, 'country.name', 120),
    country_iso3: countryIso3,
    status,
    cews_score: finite(warning.cews_score, 'early_warning.cews_score', 0, 100),
    confidence,
    event_title: nonEmpty(event.title, 'event.title', 240),
    primary_cause: nonEmpty(event.primary_cause, 'event.primary_cause', 1000),
    transmission_channels: transmission,
    market_relevance: marketRelevance,
    market_impact: item.market_impact ?? null,
    independent_evidence_count: evidenceCount,
    official_source_present: warning.official_source_present === true,
    detected_at_utc: detectedAtUtc,
    country_timezone: timezone,
    detected_at_local: detectedAtLocal,
    published_at_utc: publishedAtUtc,
    public_url: canonicalPublicUrl(item.public_url),
    source_feed_schema_version: PUBLIC_FEED_VERSION,
    source_item_schema_version: EARLY_WARNING_SCHEMA_VERSION,
    source_methodology_version: CEWS_METHOD_VERSION,
  };
}

export const PUBLIC_EARLY_WARNING_FEED_VERSION = PUBLIC_FEED_VERSION;
