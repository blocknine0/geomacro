#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { verifyProductionHistoryOnlyMigrations } from './production-history-only.mjs';

const root = process.cwd();
const migrationsDir = path.resolve(root, 'supabase/migrations');
const { verified } = verifyProductionHistoryOnlyMigrations(root);
const quarantineDir = fs.mkdtempSync(path.join(os.tmpdir(), 'geomacro-history-only-'));

try {
  for (const file of verified.keys()) {
    fs.renameSync(path.join(migrationsDir, file), path.join(quarantineDir, file));
  }

  const result = spawnSync(process.execPath, ['scripts/db/check-migration-safety.mjs'], {
    cwd: root,
    stdio: 'inherit',
  });

  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = result.status ?? 1;
  else console.log(`PASS: canonical migration safety passed after verifying and isolating ${verified.size} immutable production-history-only migrations.`);
} finally {
  for (const file of verified.keys()) {
    const quarantined = path.join(quarantineDir, file);
    if (fs.existsSync(quarantined)) {
      fs.renameSync(quarantined, path.join(migrationsDir, file));
    }
  }
  fs.rmSync(quarantineDir, { recursive: true, force: true });
}
