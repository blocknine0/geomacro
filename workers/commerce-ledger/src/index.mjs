const PAYMENT_HASH_RE = /^[0-9a-f]{64}$/;
const NAME_RE = /^[a-z0-9][a-z0-9_.-]{1,63}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LEASE_MS = 5 * 60 * 1000;
const MAX_BODY_BYTES = 512 * 1024;

function json(payload, status = 200) {
  return Response.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function bounded(value, max) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;
  if (normalized.length > max) throw new Error("REFERENCE_TOO_LONG");
  return normalized;
}

function sameNullable(left, right) {
  return (left ?? null) === (right ?? null);
}

function secureEqual(left, right) {
  const a = new TextEncoder().encode(String(left ?? ""));
  const b = new TextEncoder().encode(String(right ?? ""));
  if (a.length !== b.length || a.length < 32) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function sha256Text(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function readJson(request) {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) throw new Error("BODY_TOO_LARGE");
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) throw new Error("BODY_TOO_LARGE");
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("INVALID_BODY");
  return parsed;
}

function validateScope(body) {
  const provider = bounded(body.provider, 64);
  const providerEnvironment = bounded(body.providerEnvironment, 64);
  if (!provider || !NAME_RE.test(provider) || !providerEnvironment || !NAME_RE.test(providerEnvironment)) {
    throw new Error("INVALID_PROVIDER_SCOPE");
  }
  return { provider, providerEnvironment };
}

function validatePaymentFingerprint(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!PAYMENT_HASH_RE.test(normalized)) throw new Error("INVALID_PAYMENT_FINGERPRINT");
  return normalized;
}

function validateRequestFingerprint(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!PAYMENT_HASH_RE.test(normalized)) throw new Error("INVALID_REQUEST_FINGERPRINT");
  return normalized;
}

function validateClaimToken(value) {
  const normalized = String(value ?? "").trim();
  if (!UUID_RE.test(normalized)) throw new Error("INVALID_CLAIM_TOKEN");
  return normalized;
}

function paymentKey(fingerprint) {
  return `payment:${fingerprint}`;
}

function claimResponse(record, disposition, claimToken = null) {
  return {
    disposition,
    claim_token: claimToken,
    response_payload: disposition === "REPLAY" ? record?.responsePayload ?? null : disposition === "CLAIMED" ? record?.responsePayload ?? null : null,
    response_sha256: record?.responseSha256 ?? null,
    settlement_reference: record?.settlementReference ?? null,
    settlement_network: record?.settlementNetwork ?? null,
  };
}

export class CommerceLedger {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request) {
    if (request.method !== "POST") return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
    const action = new URL(request.url).pathname.split("/").filter(Boolean).at(-1) ?? "";
    let body;
    try {
      body = await readJson(request);
    } catch (error) {
      return json({ ok: false, error: error instanceof Error ? error.message : "INVALID_BODY" }, 400);
    }

    try {
      if (action === "claim") return json(await this.claim(body));
      if (action === "prepare") return json({ ok: await this.prepare(body) });
      if (action === "complete") return json({ ok: await this.complete(body) });
      if (action === "release") return json({ ok: await this.release(body) });
      return json({ ok: false, error: "UNKNOWN_ACTION" }, 404);
    } catch (error) {
      console.error("[commerce-ledger-do] transition failed", error instanceof Error ? error.message : "unknown");
      return json({ ok: false, error: "LEDGER_TRANSITION_FAILED" }, 409);
    }
  }

  async claim(body) {
    const paymentFingerprint = validatePaymentFingerprint(body.paymentFingerprint);
    const requestFingerprint = validateRequestFingerprint(body.requestFingerprint);
    const productId = bounded(body.productId, 128);
    const clientRequestId = bounded(body.clientRequestId, 128);
    const sourceChannel = bounded(body.sourceChannel, 96);
    const rail = bounded(body.rail, 96);
    const network = bounded(body.network, 128);
    const asset = bounded(body.asset, 128);
    const amountAtomic = body.amountAtomic == null ? null : String(body.amountAtomic);
    const recipientHash = body.recipientHash == null ? null : String(body.recipientHash).toLowerCase();
    if (!productId || productId.length < 3) throw new Error("INVALID_PRODUCT_ID");
    if (clientRequestId && clientRequestId.length < 4) throw new Error("INVALID_CLIENT_REQUEST_ID");
    if (amountAtomic != null && (!/^[0-9]+$/.test(amountAtomic) || BigInt(amountAtomic) <= 0n)) throw new Error("INVALID_AMOUNT");
    if (recipientHash != null && !PAYMENT_HASH_RE.test(recipientHash)) throw new Error("INVALID_RECIPIENT_HASH");

    const key = paymentKey(paymentFingerprint);
    const now = Date.now();
    return this.ctx.storage.transaction(async (txn) => {
      let record = await txn.get(key);
      if (!record) {
        const claimToken = crypto.randomUUID();
        record = {
          paymentFingerprint,
          requestFingerprint,
          productId,
          clientRequestId,
          sourceChannel,
          rail,
          network,
          asset,
          amountAtomic,
          recipientHash,
          payerHash: null,
          state: "processing",
          claimToken,
          leaseExpiresAt: now + LEASE_MS,
          responsePayload: null,
          responseSha256: null,
          settlementReference: null,
          settlementNetwork: null,
          failureCode: null,
          createdAt: now,
          updatedAt: now,
          settledAt: null,
          deliveredAt: null,
        };
        await txn.put(key, record);
        return claimResponse(record, "CLAIMED", claimToken);
      }

      const conflict =
        record.requestFingerprint !== requestFingerprint ||
        record.productId !== productId ||
        !sameNullable(record.rail, rail) ||
        !sameNullable(record.network, network) ||
        String(record.asset ?? "").toLowerCase() !== String(asset ?? "").toLowerCase() ||
        !sameNullable(record.amountAtomic, amountAtomic) ||
        !sameNullable(record.recipientHash, recipientHash);
      if (conflict) return claimResponse(record, "CONFLICT");

      if (record.state === "delivered" && record.responsePayload != null) {
        return claimResponse(record, "REPLAY");
      }
      if (record.state === "manual_review") return claimResponse(record, "MANUAL_REVIEW");

      if (record.state === "prepared") {
        if (record.leaseExpiresAt != null && record.leaseExpiresAt > now) {
          return claimResponse(record, "IN_PROGRESS");
        }
        record = {
          ...record,
          state: "manual_review",
          claimToken: null,
          leaseExpiresAt: null,
          failureCode: "PREPARED_LEASE_EXPIRED_RECONCILIATION_REQUIRED",
          updatedAt: now,
        };
        await txn.put(key, record);
        return claimResponse(record, "MANUAL_REVIEW");
      }

      if (
        record.state === "failed" ||
        (record.state === "processing" && (record.leaseExpiresAt == null || record.leaseExpiresAt <= now))
      ) {
        const claimToken = crypto.randomUUID();
        record = {
          ...record,
          state: record.responsePayload == null ? "processing" : "prepared",
          claimToken,
          leaseExpiresAt: now + LEASE_MS,
          failureCode: null,
          updatedAt: now,
        };
        await txn.put(key, record);
        return claimResponse(record, "CLAIMED", claimToken);
      }

      return claimResponse(record, "IN_PROGRESS");
    });
  }

  async prepare(body) {
    const paymentFingerprint = validatePaymentFingerprint(body.paymentFingerprint);
    const claimToken = validateClaimToken(body.claimToken);
    const responseSha256 = String(body.responseSha256 ?? "").trim().toLowerCase();
    if (!PAYMENT_HASH_RE.test(responseSha256) || body.responsePayload == null) return false;
    const key = paymentKey(paymentFingerprint);
    const now = Date.now();
    return this.ctx.storage.transaction(async (txn) => {
      const record = await txn.get(key);
      if (!record || record.claimToken !== claimToken || !["processing", "prepared"].includes(record.state)) return false;
      await txn.put(key, {
        ...record,
        state: "prepared",
        responsePayload: body.responsePayload,
        responseSha256,
        updatedAt: now,
        leaseExpiresAt: now + LEASE_MS,
      });
      return true;
    });
  }

  async complete(body) {
    const paymentFingerprint = validatePaymentFingerprint(body.paymentFingerprint);
    const claimToken = validateClaimToken(body.claimToken);
    const payerHash = body.payerHash == null ? null : String(body.payerHash).trim().toLowerCase();
    const settlementReference = bounded(body.settlementReference, 256);
    const settlementNetwork = bounded(body.settlementNetwork, 128);
    if (payerHash != null && !PAYMENT_HASH_RE.test(payerHash)) return false;
    if (!settlementReference) return false;

    const key = paymentKey(paymentFingerprint);
    const settlementKey = `settlement:${await sha256Text(settlementReference)}`;
    const now = Date.now();
    return this.ctx.storage.transaction(async (txn) => {
      const record = await txn.get(key);
      if (
        !record ||
        record.claimToken !== claimToken ||
        record.state !== "prepared" ||
        record.responsePayload == null ||
        record.responseSha256 == null
      ) return false;

      const existingPayment = await txn.get(settlementKey);
      if (existingPayment && existingPayment !== paymentFingerprint) return false;

      await txn.put(settlementKey, paymentFingerprint);
      await txn.put(key, {
        ...record,
        state: "delivered",
        claimToken: null,
        leaseExpiresAt: null,
        payerHash,
        settlementReference,
        settlementNetwork,
        failureCode: null,
        settledAt: now,
        deliveredAt: now,
        updatedAt: now,
      });
      return true;
    });
  }

  async release(body) {
    const paymentFingerprint = validatePaymentFingerprint(body.paymentFingerprint);
    const claimToken = validateClaimToken(body.claimToken);
    const failureCode = bounded(body.failureCode || "UNKNOWN", 160) ?? "UNKNOWN";
    const manualReview = body.manualReview === true;
    const key = paymentKey(paymentFingerprint);
    const now = Date.now();
    return this.ctx.storage.transaction(async (txn) => {
      const record = await txn.get(key);
      if (!record || record.claimToken !== claimToken || !["processing", "prepared"].includes(record.state)) return false;
      await txn.put(key, {
        ...record,
        state: manualReview ? "manual_review" : "failed",
        claimToken: null,
        leaseExpiresAt: null,
        failureCode,
        updatedAt: now,
      });
      return true;
    });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, service: "geomacro-commerce-ledger", storage: "durable_objects_sqlite" });
    }
    if (request.method !== "POST" || !url.pathname.startsWith("/v1/delivery/")) {
      return json({ ok: false, error: "NOT_FOUND" }, 404);
    }

    const expected = String(env.LEDGER_SHARED_TOKEN ?? "").trim();
    const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
    if (!secureEqual(expected, supplied)) return json({ ok: false, error: "UNAUTHORIZED" }, 401);

    let body;
    try {
      body = await readJson(request.clone());
      const scope = validateScope(body);
      const id = env.COMMERCE_LEDGER.idFromName(`${scope.provider}:${scope.providerEnvironment}`);
      const stub = env.COMMERCE_LEDGER.get(id);
      const action = url.pathname.split("/").filter(Boolean).at(-1);
      return stub.fetch(`https://ledger.internal/${action}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (error) {
      return json({ ok: false, error: error instanceof Error ? error.message : "INVALID_REQUEST" }, 400);
    }
  },
};
