#!/usr/bin/env node
const EXPECTED = process.env.EXPECTED_SUPABASE_PROJECT_REF || 'ldpwajisioljyjtojvfx';
const url = process.env.APP_SUPABASE_URL || process.env.SUPABASE_URL || '';

if (!url) {
  console.error('❌ No APP_SUPABASE_URL/SUPABASE_URL configured.');
  process.exit(1);
}

let host;
try { host = new URL(url).hostname; } catch {
  console.error('❌ Invalid Supabase URL.');
  process.exit(1);
}

const actual = host.endsWith('.supabase.co') ? host.split('.')[0] : null;
if (!actual || actual !== EXPECTED) {
  console.error(`❌ Refusing database operation: expected Supabase project ${EXPECTED}, got ${actual || host}.`);
  process.exit(1);
}
console.log(`✅ Supabase target verified: ${EXPECTED}`);
