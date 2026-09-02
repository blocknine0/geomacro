#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';

const EXPECTED =
  process.env.EXPECTED_SUPABASE_PROJECT_REF || 'ldpwajisioljyjtojvfx';

const url =
  process.env.APP_SUPABASE_URL ||
  process.env.SUPABASE_URL;

const key =
  process.env.APP_SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  throw new Error(
    'APP_SUPABASE_URL/SUPABASE_URL and service-role key are required'
  );
}

const host = new URL(url).hostname;
const ref = host.endsWith('.supabase.co')
  ? host.split('.')[0]
  : null;

if (ref !== EXPECTED) {
  throw new Error(
    `Refusing schema verification against ${ref || host}; expected ${EXPECTED}`
  );
}

const sb = createClient(url, key, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const contract = {
  events: [
    'id',
    'source_url',
    'source_title',
    'category',
    'narrative',
    'summary',
    'stage',
    'severity',
    'confidence',
    'delta',
    'published_at',
    'created_at',
    'lifecycle_stage',
    'market_created',
    'market_resolved',
    'classification_version',
  ],
  market_disputes: [
    'id',
    'event_id',
    'market_id',
    'disputer_address',
    'disputed_at',
    'resolved',
    'final_verdict',
  ],
  jury_votes: [
    'id',
    'market_id',
    'juror_role',
    'juror_wallet',
    'verdict',
    'tx_hash',
    'voted_at',
  ],
  gri_snapshots: [
    'id',
    'as_of',
    'methodology_version',
    'raw_score',
    'display_score',
    'proof_version',
    'proof_hash',
    'verification_status',
  ],
  gri_contributions: [
    'snapshot_id',
    'event_id',
    'contribution_points',
  ],
  gri_validation_runs: [
    'id',
    'methodology_version',
    'status',
    'created_at',
  ],
  gri_validation_metrics: [
    'validation_run_id',
    'benchmark_key',
    'horizon_hours',
    'split',
    'sample_count',
  ],
  gri_replay_runs: [
    'id',
    'methodology_version',
    'replay_version',
    'status',
    'created_at',
  ],
  gri_replay_snapshots: [
    'replay_run_id',
    'as_of',
    'raw_score',
    'display_score',
    'methodology_hash',
    'calculation_hash',
  ],
};

for (const [table, columns] of Object.entries(contract)) {
  const { error } = await sb
    .from(table)
    .select(columns.join(','))
    .limit(0);

  if (error) {
    throw new Error(`${table} contract failed: ${error.message}`);
  }

  console.log(`✅ ${table}`);
}

console.log(
  '✅ Core Geomacro schema contract is present on the authoritative database.'
);
