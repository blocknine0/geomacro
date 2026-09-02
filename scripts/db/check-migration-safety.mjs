#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve('supabase/migrations');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
const errors = [];

function stripSqlComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\r\n]*/g, ' ');
}

const destructive = [
  [/\bdrop\s+table\b/i, 'DROP TABLE'],
  [/\bdrop\s+schema\b/i, 'DROP SCHEMA'],
  [/\btruncate\b/i, 'TRUNCATE'],
  [/\balter\s+table[\s\S]{0,250}\bdrop\s+(column|constraint)\b/i, 'ALTER TABLE ... DROP'],
  [/\bdelete\s+from\b/i, 'DELETE FROM'],
];

for (const file of files) {
  const raw = fs.readFileSync(path.join(dir, file), 'utf8');
  const sql = stripSqlComments(raw);

  for (const [re, label] of destructive) {
    if (re.test(sql)) {
      errors.push(`${file}: forbidden ${label}`);
    }
  }
}

const required = [
  '000_core_schema.sql',
  '001_ai_jury_dispute_system.sql',
  '002_events_schema_backfill.sql',
  '004_gri_audit_system.sql',
  '010_gri_comparison_continuity.sql',
  '011_agent_intelligence_commerce.sql',
];

for (const migration of required) {
  if (!files.includes(migration)) {
    errors.push(`missing required migration ${migration}`);
  }
}

if (errors.length) {
  console.error(
    '❌ Migration safety check failed:\n' +
      errors.map((error) => ` - ${error}`).join('\n'),
  );
  process.exit(1);
}

console.log(
  `✅ ${files.length} migration(s) passed destructive-SQL and baseline checks.`,
);
