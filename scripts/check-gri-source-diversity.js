#!/usr/bin/env node

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const args = process.argv.slice(2);
const enforce = args.includes('--enforce');

const lookbackHours = Number(
  process.env.GRI_DIVERSITY_LOOKBACK_HOURS || 72
);

const minDomains = Number(
  process.env.GRI_MIN_SOURCE_DOMAINS || 3
);

const maxSingleSourceShare = Number(
  process.env.GRI_MAX_SINGLE_SOURCE_SHARE || 0.70
);

const url =
  process.env.SUPABASE_URL ||
  process.env.APP_SUPABASE_URL;

const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.APP_SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  throw new Error(
    'Supabase URL/service-role key required'
  );
}

const supabase = createClient(url, key, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const cutoff = new Date(
  Date.now() - lookbackHours * 60 * 60 * 1000
).toISOString();

const {
  data,
  error,
} = await supabase
  .from('events')
  .select(
    [
      'id',
      'source_name',
      'source_domain',
      'category',
      'classification_version',
      'classification_prompt_version',
      'created_at',
    ].join(',')
  )
  .gte('created_at', cutoff)
  .eq(
    'classification_version',
    'event-severity-v1.0.4'
  )
  .eq(
    'classification_prompt_version',
    'risk-desk-filter-v1.0.4'
  );

if (error) {
  throw new Error(
    `diversity query failed: ${error.message}`
  );
}

const rows = data ?? [];

const byDomain = new Map();

for (const row of rows) {
  const domain =
    String(row.source_domain || '')
      .trim()
      .toLowerCase() ||
    '<missing>';

  byDomain.set(
    domain,
    (byDomain.get(domain) || 0) + 1
  );
}

const ranked = [...byDomain.entries()]
  .sort((a, b) => b[1] - a[1]);

const total = rows.length;
const domainCount = ranked.length;

const [topDomain, topCount] =
  ranked[0] || [null, 0];

const topShare =
  total > 0
    ? topCount / total
    : 0;

const guardianCount =
  byDomain.get('theguardian.com') || 0;

const guardianShare =
  total > 0
    ? guardianCount / total
    : 0;

const domainPass =
  domainCount >= minDomains;

const concentrationPass =
  total === 0 ||
  topShare <= maxSingleSourceShare;

const pass =
  domainPass &&
  concentrationPass;

const report = {
  lookbackHours,
  canonicalEvents: total,

  independentSourceDomains:
    domainCount,

  minimumRequiredDomains:
    minDomains,

  topSource: topDomain,
  topSourceEvents: topCount,

  topSourceShare:
    Number(
      (topShare * 100).toFixed(2)
    ),

  maximumAllowedSingleSourceShare:
    Number(
      (
        maxSingleSourceShare *
        100
      ).toFixed(2)
    ),

  guardianEvents:
    guardianCount,

  guardianShare:
    Number(
      (
        guardianShare *
        100
      ).toFixed(2)
    ),

  domains: Object.fromEntries(ranked),

  domainPass,
  concentrationPass,
  pass,
};

console.log(
  '=== GRI SOURCE DIVERSITY ==='
);

console.log(
  JSON.stringify(
    report,
    null,
    2
  )
);

if (!pass) {
  const problems = [];

  if (!domainPass) {
    problems.push(
      `${domainCount} independent domain(s), minimum=${minDomains}`
    );
  }

  if (!concentrationPass) {
    problems.push(
      `top source share=${(
        topShare * 100
      ).toFixed(2)}%, maximum=${(
        maxSingleSourceShare * 100
      ).toFixed(2)}%`
    );
  }

  const message =
    `GRI source diversity gate not satisfied: ` +
    problems.join('; ');

  if (enforce) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }

  console.warn(
    `WARN: ${message}`
  );
} else {
  console.log(
    'PASS: GRI source diversity gate satisfied'
  );
}
