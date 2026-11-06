import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { apiKeyHash, hash, isApiKey, mintApiKey } from '../src/metering.mjs';

test('new commercial API keys have 256 random bits and use scrypt, not fast SHA-256', () => {
  const first = mintApiKey();
  const second = mintApiKey();
  for (const key of [first, second]) {
    assert.match(key.secret, /^gm_live2_[A-Za-z0-9_-]{43}$/);
    assert.equal(Buffer.from(key.secret.slice(9), 'base64url').length, 32);
    assert.equal(isApiKey(key.secret), true);
    assert.match(key.hash, /^[0-9a-f]{64}$/);
    assert.equal(key.hash, apiKeyHash(key.secret));
    assert.notEqual(key.hash, hash(key.secret));
    assert.equal(key.prefix, key.secret.slice(0, 16));
    assert.equal(JSON.stringify({hash:key.hash, prefix:key.prefix}).includes(key.secret), false);
  }
  assert.notEqual(first.secret, second.secret);
  assert.notEqual(first.hash, second.hash);
});

test('existing 256-bit gm_live_ keys remain valid without a forced migration', () => {
  const legacy = 'gm_live_' + randomBytes(32).toString('base64url');
  assert.equal(isApiKey(legacy), true);
  assert.equal(apiKeyHash(legacy), hash(legacy));
});

test('malformed, shortened and noncanonical keys fail before hashing', () => {
  for (const key of [
    '', 'gm_live_password', 'gm_live2_password',
    'gm_live2_' + 'a'.repeat(42),
    'gm_live2_' + 'a'.repeat(43),
    'gm_live_' + 'a'.repeat(43),
    'gm_live2_' + '%'.repeat(43),
    'gm_live2_' + '../'.repeat(14) + 'a',
  ]) {
    assert.equal(isApiKey(key), false);
    assert.throws(() => apiKeyHash(key), /API_KEY_INVALID/);
  }
});
