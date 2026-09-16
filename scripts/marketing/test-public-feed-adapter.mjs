import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

import {
  normalizePublicFeedItem,
  validatePublicEarlyWarningFeed,
} from './public-feed-adapter.mjs';

const fixture = JSON.parse(
  await fs.readFile('scripts/marketing/fixtures/sample-public-early-warning-feed.json', 'utf8'),
);
const feed = validatePublicEarlyWarningFeed(fixture);
const alert = normalizePublicFeedItem(feed.items[0]);

assert.equal(alert.alert_id, 'sample-ind-20260916-public-001');
assert.equal(alert.content_type, 'early_warning');
assert.equal(alert.visibility, 'public');
assert.equal(alert.country, 'India');
assert.equal(alert.country_iso3, 'IND');
assert.equal(alert.status, 'WARNING');
assert.equal(alert.confidence, 0.86);
assert.equal(alert.country_timezone, 'Asia/Kolkata');
assert.equal(alert.market_relevance.fx, 'VERY_HIGH');
assert.equal(alert.source_feed_schema_version, 'geomacro.public-early-warning-feed.v1');

const unsafe = structuredClone(fixture);
unsafe.items[0].boundaries.trading_instruction = true;
assert.throws(
  () => normalizePublicFeedItem(unsafe.items[0]),
  /safety boundaries mismatch/,
);

const badFeed = structuredClone(fixture);
badFeed.count = 2;
assert.throws(() => validatePublicEarlyWarningFeed(badFeed), /count mismatch/);

console.log('PASS: canonical public Early Warning feed adapts to the bounded distribution payload.');
