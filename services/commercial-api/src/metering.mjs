import { createHash, randomBytes, sign, verify, createPublicKey } from 'node:crypto';

export const hash = value => createHash('sha256').update(value, 'utf8').digest('hex');
// SHA-256 here commits signed receipt bytes and identifies 256-bit randomly
// minted API tokens. It must NEVER be used for a human-selected password.
// See security regression tests and commercial API threat-model documentation.
// Deterministic JSON for this protocol, NOT a claim of RFC 8785 conformance.
// Store and replay these exact UTF-8 bytes; never reserialize before verifying.
export function canonicalize(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype)
    return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonicalize(value[k])}`).join(',')}}`;
  throw new TypeError('Payload must contain JSON values only');
}
export function mintApiKey() {
  const secret = `gm_live_${randomBytes(32).toString('base64url')}`;
  return { secret, hash: hash(secret), prefix: secret.slice(0, 16) };
}
export class BillingError extends Error {
  constructor(code, cause) { super(code, { cause }); this.code = code; }
}
export function verifyReceipt(canonicalPayload, receipt, publicKey) {
  try {
    const payload = JSON.parse(canonicalPayload);
    return payload.execution_authorized === false && payload.public_key_id === receipt.public_key_id &&
      payload.generated_at === receipt.timestamp && hash(canonicalPayload) === receipt.hash &&
      verify(null, Buffer.from(canonicalPayload, 'utf8'), publicKey, Buffer.from(receipt.signature, 'base64'));
  } catch { return false; }
}

/** Backend-only; never import into a browser. pool is a pg.Pool-compatible adapter.
 * availableTiers and risk must come from qualified server-side evidence, NEVER
 * request JSON. Each riskByTier[tier] must describe the actually served tier.
 * No network I/O is performed while holding the database lock.
 */
export async function settleVerifiedSuccess(pool, {
  apiKey, requestId, subject, requestedTier, availableTiers, riskByTier,
  privateKey, publicKeyId, publicKeys, signal,
}) {
  if (!/^gm_live_[A-Za-z0-9_-]{43}$/.test(apiKey) ||
      !['basic', 'standard', 'complex'].includes(requestedTier) ||
      typeof subject !== 'string' || !subject.length || !Array.isArray(availableTiers))
    throw new BillingError('INVALID_REQUEST');
  const requestHash = hash(canonicalize({ method: 'POST', path: '/v1/risk-gate', subject, tier: requestedTier }));
  // Add all future request options affecting output to this fingerprint.
  const db = await pool.connect();
  let committing = false;
  try {
    signal?.throwIfAborted();
    await db.query('BEGIN');
    await db.query("SET LOCAL statement_timeout = '5000ms'");
    await db.query("SET LOCAL lock_timeout = '3000ms'");
    await db.query("SET LOCAL idle_in_transaction_session_timeout = '10000ms'");
    const args = [hash(apiKey), requestId, requestHash, subject, requestedTier, availableTiers];
    const { rows: [{ result: q }] } = await db.query(
      'SELECT geomacro.prepare($1,$2,$3,$4,$5,$6) AS result', args);
    let result = q;
    if (!q.replay) {
      const risk = riskByTier[q.billed_tier];
      if (!risk || !['allow', 'review', 'deny'].includes(risk.decision) ||
          !Number.isFinite(risk.risk_score) || risk.risk_score < 0 || risk.risk_score > 100 ||
          !Array.isArray(risk.factors)) throw new BillingError('INCONCLUSIVE_NO_CHARGE');
      const units = Number(q.credit_units);
      if (!Number.isSafeInteger(units)) throw new BillingError('UNSAFE_CREDIT_AMOUNT');
      const payload = {
        request_id: requestId, subject, requested_tier: requestedTier,
        decision: risk.decision, risk_score: risk.risk_score, factors: risk.factors,
        billed_tier: q.billed_tier, credits_deducted: units / 1_000_000,
        execution_authorized: false, generated_at: new Date().toISOString(), public_key_id: publicKeyId,
      };
      const canonicalPayload = canonicalize(payload);
      const signature = sign(null, Buffer.from(canonicalPayload, 'utf8'), privateKey).toString('base64');
      const publicKey = publicKeys[publicKeyId];
      if (!publicKey || createPublicKey(privateKey).asymmetricKeyType !== 'ed25519')
        throw new BillingError('SIGNING_KEY_UNAVAILABLE');
      const receipt = { signature, public_key_id: publicKeyId, timestamp: payload.generated_at, hash: hash(canonicalPayload) };
      if (!verifyReceipt(canonicalPayload, receipt, publicKey)) throw new BillingError('SIGNATURE_VERIFICATION_FAILED');
      const { rows } = await db.query(
        'SELECT geomacro.settle_success($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) AS result',
        [q.user_id, q.api_key_id, requestId, requestHash, subject, requestedTier, availableTiers, canonicalPayload, signature, publicKeyId]);
      result = rows[0].result;
    }
    // Retain historical public keys: replay verifies the stored receipt too.
    if (!verifyReceipt(result.canonical_payload, result.audit_receipt, publicKeys[result.audit_receipt.public_key_id]))
      throw new BillingError('STORED_SIGNATURE_VERIFICATION_FAILED');
    signal?.throwIfAborted();
    // Construct and serialize the exact HTTP body BEFORE committing any charge.
    const responseBody = JSON.stringify({ ...JSON.parse(result.canonical_payload), audit_receipt: result.audit_receipt });
    committing = true;
    await db.query('COMMIT');
    return { status: 200, responseBody, canonicalPayload: result.canonical_payload, replayed: result.replay };
  } catch (error) {
    try { await db.query('ROLLBACK'); } catch { /* connection may have closed */ }
    // A lost COMMIT acknowledgement cannot prove rollback. Retry the SAME
    // request ID to discover its outcome; never retry with a new request ID.
    if (committing) throw new BillingError('SETTLEMENT_OUTCOME_UNKNOWN_RETRY_SAME_ID', error);
    throw error;
  } finally { db.release(); }
}
