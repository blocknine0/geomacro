#!/usr/bin/env node
import { appendFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const url = process.env.APP_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.APP_SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  throw new Error('APP_SUPABASE_URL/SUPABASE_URL and service-role key are required');
}

const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const LOOKBACK_HOURS = 72;
const CANONICAL_CLASSIFICATION_VERSION = 'event-severity-v1.0.5';
const CANONICAL_CLASSIFICATION_PROMPT_VERSION = 'risk-desk-filter-v1.0.5';
const PRIORITY_ORDER = ['rare_earth', 'geopolitics', 'macro'];

const cutoff = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();

const { data, error } = await db
  .from('events')
  .select('category,created_at')
  .gte('created_at', cutoff)
  .eq('classification_version', CANONICAL_CLASSIFICATION_VERSION)
  .eq('classification_prompt_version', CANONICAL_CLASSIFICATION_PROMPT_VERSION)
  .in('category', PRIORITY_ORDER);

if (error) {
  throw new Error(`Missing-domain preflight query failed: ${error.message}`);
}

const counts = new Map(PRIORITY_ORDER.map((category) => [category, 0]));
const latest = new Map(PRIORITY_ORDER.map((category) => [category, null]));

for (const row of data ?? []) {
  if (!counts.has(row.category)) continue;
  counts.set(row.category, (counts.get(row.category) ?? 0) + 1);

  const current = latest.get(row.category);
  if (!current || new Date(row.created_at).getTime() > new Date(current).getTime()) {
    latest.set(row.category, row.created_at);
  }
}

const missing = PRIORITY_ORDER.find((category) => (counts.get(category) ?? 0) === 0) ?? null;

console.log(
  'GRI discovery-domain preflight:',
  PRIORITY_ORDER.map((category) => ({
    category,
    canonicalEvents72h: counts.get(category) ?? 0,
    latestCanonicalEvent: latest.get(category),
  }))
);

if (!missing) {
  console.log('All GRI discovery domains have canonical evidence inside the 72h window; normal GDELT rotation remains active.');
  process.exit(0);
}

console.log(`Missing GRI discovery domain detected: ${missing}. Forcing the single GDELT slot to that domain for this run.`);

if (process.env.GITHUB_ENV) {
  await appendFile(process.env.GITHUB_ENV, `GDELT_FORCE_CATEGORY=${missing}\n`, 'utf8');
} else {
  console.log(`GDELT_FORCE_CATEGORY=${missing}`);
}
