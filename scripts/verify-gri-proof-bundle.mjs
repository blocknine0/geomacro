#!/usr/bin/env node

import {
  readFile,
} from 'node:fs/promises';

import {
  verifyPortableGriProofBundle,
} from './lib/gri-portable-proof-v12.js';

const [bundlePath, trustedProofHash] =
  process.argv.slice(2);

if (!bundlePath) {
  console.error(
    'Usage: node scripts/verify-gri-proof-bundle.mjs <bundle.json> [trusted-proof-hash]',
  );
  process.exit(2);
}

let bundle;

try {
  bundle = JSON.parse(
    await readFile(
      bundlePath,
      'utf8',
    ),
  );
} catch (error) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error:
          'unable_to_read_or_parse_bundle',
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
        trustedProofHash ?? null,
    },
  );

console.log(
  JSON.stringify(
    report,
    null,
    2,
  ),
);

process.exit(
  report.valid ? 0 : 1,
);