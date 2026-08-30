#!/usr/bin/env node
import dotenv from 'dotenv';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

dotenv.config();
const url = process.env.SUPABASE_URL || process.env.APP_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.APP_SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Supabase URL and service-role key are required');
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const args = process.argv.slice(2);
const fullHistory = args.includes('--full-history');
const daysIndex = args.indexOf('--days');
const days = daysIndex >= 0 ? Math.max(1, Number(args[daysIndex + 1] || 30)) : 45;
const since = fullHistory ? null : new Date(Date.now() - days * 86_400_000);

function sha256(s) {
  return createHash('sha256').update(String(s), 'utf8').digest('hex');
}

function parseFredCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  return lines.slice(1).map((line) => {
    const comma = line.indexOf(',');
    if (comma < 0) return null;
    const date = line.slice(0, comma).trim();
    const raw = line.slice(comma + 1).trim();
    const value = Number(raw);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(value)) return null;
    return { date, value };
  }).filter(Boolean);
}

async function main() {
  const { data: definitions, error } = await supabase
    .from('gri_benchmark_definitions')
    .select('benchmark_key,source_name,source_series_id')
    .eq('active', true)
    .eq('source_name', 'FRED');
  if (error) throw new Error(`benchmark definitions query failed: ${error.message}`);

  let insertedTotal = 0;
  for (const def of definitions ?? []) {
    if (!def.source_series_id) continue;
    const sourceUrl = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(def.source_series_id)}`;
    const response = await fetch(sourceUrl, { headers: { 'user-agent': 'Geomacro-GRI-Validation/1.0' } });
    if (!response.ok) throw new Error(`FRED ${def.source_series_id} returned HTTP ${response.status}`);
    const observations = parseFredCsv(await response.text())
      .filter((o) => !since || new Date(`${o.date}T00:00:00Z`) >= since);
    const rows = observations.map((o) => {
      const observedAt = `${o.date}T23:59:59.000Z`;
      const input = `${def.benchmark_key}|${observedAt}|${o.value}|FRED|${def.source_series_id}`;
      return {
        benchmark_key: def.benchmark_key,
        observed_at: observedAt,
        value: o.value,
        source_name: 'FRED',
        source_url: sourceUrl,
        source_series_id: def.source_series_id,
        input_hash: sha256(input),
      };
    });

    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      if (!chunk.length) continue;
      // Ignore already-recorded observations. We intentionally do not revise
      // historical benchmark rows in place; the first ingested value remains
      // the validation input for reproducibility.
      const { error: insertError } = await supabase
        .from('gri_benchmark_observations')
        .upsert(chunk, { onConflict: 'benchmark_key,observed_at', ignoreDuplicates: true });
      if (insertError) throw new Error(`${def.benchmark_key} insert failed: ${insertError.message}`);
      insertedTotal += chunk.length;
    }
    console.log(`✓ ${def.benchmark_key}: processed ${rows.length} observations`);
  }
  console.log(`✅ Benchmark ingestion complete; processed ${insertedTotal} candidate rows.`);
}

main().catch((error) => {
  console.error('❌ GRI benchmark ingestion failed:', error?.stack || error?.message || error);
  process.exit(1);
});
