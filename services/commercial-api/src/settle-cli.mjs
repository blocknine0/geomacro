import { readFile } from 'node:fs/promises';
import { createPrivateKey, createPublicKey } from 'node:crypto';
import { pool } from './db.mjs';
import { settleVerifiedSuccess } from './metering.mjs';
// Developer-only server CLI. Input must be a trusted qualified evidence result,
// NOT arbitrary public request JSON. This is not the public risk-gate route.
try {
  for (const name of ['GEOMACRO_API_KEY','REQUEST_ID','SIGNING_PRIVATE_KEY_FILE','SIGNING_PUBLIC_KEY_FILE','SIGNING_PUBLIC_KEY_ID'])
    if (!process.env[name]) throw new Error(`${name} is required`);
  if (!process.argv[2]) throw new Error('Usage: node src/settle-cli.mjs trusted-risk-result.json');
  const input = JSON.parse(await readFile(process.argv[2], 'utf8'));
  const keyId = process.env.SIGNING_PUBLIC_KEY_ID;
  const result = await settleVerifiedSuccess(pool, {
    subject: input.subject, requestedTier: input.requestedTier,
    availableTiers: input.availableTiers, riskByTier: input.riskByTier,
    apiKey: process.env.GEOMACRO_API_KEY, requestId: process.env.REQUEST_ID,
    privateKey: createPrivateKey(await readFile(process.env.SIGNING_PRIVATE_KEY_FILE)),
    publicKeyId: keyId,
    publicKeys: { [keyId]: createPublicKey(await readFile(process.env.SIGNING_PUBLIC_KEY_FILE)) },
    signal: AbortSignal.timeout(10_000),
  });
  process.stdout.write(`${result.responseBody}\n`);
} catch (error) {
  console.error(error.code ?? error.message);
  process.exitCode = 1;
} finally { await pool.end(); }
