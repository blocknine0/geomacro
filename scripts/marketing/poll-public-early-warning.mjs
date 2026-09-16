import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  normalizePublicFeedItem,
  validatePublicEarlyWarningFeed,
} from './public-feed-adapter.mjs';

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, '').split('=');
    return [key, rest.length ? rest.join('=') : true];
  }),
);

const root = process.cwd();
const inputPath = args.get('input');
const limit = Number(args.get('limit') || 5);
const channels = String(args.get('channels') || 'telegram,discord,bluesky,mastodon');
const configuredUrl = String(
  args.get('url') || process.env.PUBLIC_EARLY_WARNING_FEED_URL || 'https://geomacro.live/api/early-warning',
);

if (!Number.isInteger(limit) || limit < 1 || limit > 25) {
  throw new Error('--limit must be an integer from 1 to 25');
}
if (args.has('live')) {
  throw new Error('The public-feed poller is shadow-only until the durable distribution receipt ledger is implemented');
}

async function loadFeed() {
  if (inputPath) {
    return JSON.parse(await fs.readFile(path.resolve(root, String(inputPath)), 'utf8'));
  }
  const url = new URL(configuredUrl);
  if (url.protocol !== 'https:' || url.hostname !== 'geomacro.live') {
    throw new Error('Live feed polling is restricted to https://geomacro.live');
  }
  url.searchParams.set('limit', String(limit));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      headers: {
        accept: 'application/json',
        'user-agent': 'geomacro-auto-distribution-shadow/1.0',
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`public Early Warning feed returned HTTP ${response.status}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

const feed = validatePublicEarlyWarningFeed(await loadFeed());
const selected = feed.items.slice(0, limit);
const results = [];

for (const item of selected) {
  const alert = normalizePublicFeedItem(item);
  const temp = path.join(os.tmpdir(), `geomacro-distribution-${alert.alert_id.replace(/[^a-zA-Z0-9_.-]/g, '_')}.json`);
  await fs.writeFile(temp, `${JSON.stringify(alert, null, 2)}\n`, { mode: 0o600 });
  try {
    const run = spawnSync(
      process.execPath,
      [
        path.join(root, 'scripts/marketing/auto-distribute-alert.mjs'),
        `--input=${temp}`,
        `--channels=${channels}`,
      ],
      { cwd: root, encoding: 'utf8' },
    );
    if (run.status !== 0) {
      throw new Error(`renderer failed for ${alert.alert_id}: ${(run.stderr || run.stdout).trim()}`);
    }
    results.push({
      alert_id: alert.alert_id,
      rendered: JSON.parse(run.stdout),
    });
  } finally {
    await fs.rm(temp, { force: true });
  }
}

console.log(
  JSON.stringify(
    {
      mode: 'shadow',
      live_publish_attempted: false,
      source_feed_schema_version: feed.feed_schema_version,
      source_generated_at_utc: feed.generated_at_utc,
      source_count: feed.count,
      rendered_count: results.length,
      channels: channels.split(',').map((value) => value.trim()).filter(Boolean),
      results,
    },
    null,
    2,
  ),
);
