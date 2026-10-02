#!/usr/bin/env node

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const MANIFEST_RELATIVE_PATH = 'config/production-history-only-migrations.json';
const MIGRATIONS_RELATIVE_DIR = 'supabase/migrations';

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function productionStatementBytes(fileBuffer) {
  // Git text files conventionally carry one terminal LF; Supabase stores the
  // migration statement text without that file terminator. Strip exactly one
  // terminal LF and normalize nothing else, so SQL body bytes remain pinned.
  if (fileBuffer.length > 0 && fileBuffer[fileBuffer.length - 1] === 0x0a) {
    return fileBuffer.subarray(0, fileBuffer.length - 1);
  }
  return fileBuffer;
}

export function loadProductionHistoryOnlyManifest(root = process.cwd()) {
  const manifestPath = path.resolve(root, MANIFEST_RELATIVE_PATH);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  if (manifest.schema_version !== 'geomacro.production-history-only-migrations.v1') {
    throw new Error(`Unexpected production-history manifest schema: ${manifest.schema_version}`);
  }
  if (!Array.isArray(manifest.migrations) || manifest.migrations.length !== 46) {
    throw new Error(`Production-history manifest must contain exactly 46 migrations; got ${manifest.migrations?.length ?? 'invalid'}`);
  }

  const seen = new Set();
  for (const entry of manifest.migrations) {
    if (!entry || typeof entry.file !== 'string' || !entry.file.endsWith('.sql')) {
      throw new Error('Invalid production-history migration filename');
    }
    if (!/^[a-f0-9]{64}$/.test(entry.sha256 ?? '')) {
      throw new Error(`Invalid production-history SHA-256 for ${entry.file}`);
    }
    if (seen.has(entry.file)) {
      throw new Error(`Duplicate production-history migration entry: ${entry.file}`);
    }
    seen.add(entry.file);
  }

  return manifest;
}

export function verifyProductionHistoryOnlyMigrations(root = process.cwd()) {
  const manifest = loadProductionHistoryOnlyManifest(root);
  const migrationsDir = path.resolve(root, MIGRATIONS_RELATIVE_DIR);
  const verified = new Map();

  for (const entry of manifest.migrations) {
    const migrationPath = path.join(migrationsDir, entry.file);
    if (!fs.existsSync(migrationPath)) {
      throw new Error(`Missing production-history migration: ${entry.file}`);
    }
    const actual = sha256(productionStatementBytes(fs.readFileSync(migrationPath)));
    if (actual !== entry.sha256) {
      throw new Error(`Production-history migration hash mismatch: ${entry.file}; expected=${entry.sha256}; actual=${actual}`);
    }
    verified.set(entry.file, entry.sha256);
  }

  return { manifest, verified };
}

export function productionHistoryOnlyMigrationNames(root = process.cwd()) {
  return new Set(verifyProductionHistoryOnlyMigrations(root).verified.keys());
}

export function quarantineProductionHistoryOnlyMigrations(targetDir, root = process.cwd()) {
  if (!targetDir) throw new Error('A quarantine target directory is required');
  const { verified } = verifyProductionHistoryOnlyMigrations(root);
  const migrationsDir = path.resolve(root, MIGRATIONS_RELATIVE_DIR);
  const destinationDir = path.resolve(root, targetDir);
  fs.mkdirSync(destinationDir, { recursive: true });

  for (const file of verified.keys()) {
    fs.renameSync(path.join(migrationsDir, file), path.join(destinationDir, file));
  }

  return verified.size;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const mode = process.argv[2] ?? 'verify';
  if (mode === 'verify') {
    const { verified } = verifyProductionHistoryOnlyMigrations();
    console.log(`PASS: verified ${verified.size} hash-pinned production-history-only migration files.`);
  } else if (mode === 'quarantine') {
    const count = quarantineProductionHistoryOnlyMigrations(process.argv[3]);
    console.log(`PASS: verified and quarantined ${count} production-history-only migration files for canonical zero-replay.`);
  } else {
    throw new Error(`Unsupported mode: ${mode}`);
  }
}
