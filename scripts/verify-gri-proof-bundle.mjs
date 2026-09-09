#!/usr/bin/env node

import {
  readFile,
} from 'node:fs/promises';

import {
  verifyPortableGriProofBundle,
} from './lib/gri-portable-proof-v12.js';

function usage() {
  return [
    'Usage:',
    '  node scripts/verify-gri-proof-bundle.mjs <bundle.json> [expected-proof-hash]',
    '  cat bundle.json | node scripts/verify-gri-proof-bundle.mjs - [expected-proof-hash]',
    '',
    'The expected proof hash should be obtained independently from a trusted',
    'Geomacro publication/API. Without it the command verifies internal',
    'reproducibility, not issuer authenticity.',
  ].join('\n');
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

const [path, expectedProofHash] =
  process.argv.slice(2);

if (!path) {
  console.error(usage());
  process.exit(2);
}

let raw;

try {
  raw = path === '-'
    ? await readStdin()
    : await readFile(path, 'utf8');
} catch (error) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: 'bundle_read_failed',
        message:
          error instanceof Error
            ? error.message
            : String(error),
      },
      null,
      2,
    ),
  );
  process.exit(2);
}

let bundle;

try {
  bundle = JSON.parse(raw);
} catch {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: 'bundle_json_invalid',
      },
      null,
      2,
    ),
  );
  process.exit(2);
}

const report =
  verifyPortableGriProofBundle(
    bundle,
    {
      expectedProofHash:
        expectedProofHash ?? null,
    },
  );

console.log(
  JSON.stringify(
    {
      ok: report.valid,
      ...report,
    },
    null,
    2,
  ),
);

process.exit(
  report.valid ? 0 : 1,
);
