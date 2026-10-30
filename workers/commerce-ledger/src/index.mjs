import {assertCapabilityPrequote,CAPABILITY_PREQUOTE_LIMIT} from './capability-prequote.mjs';
import {assertStructuralCandidate,STRUCTURAL_CANDIDATE_VERSION} from './structural-candidate.mjs';
const PAYMENT_HASH_RE = /^[0-9a-f]{64}$/;
const NAME_RE = /^[a-z0-9][a-z0-9_.-]{1,63}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LEASE_MS = 5 * 60 * 1000;
const MAX_BODY_BYTES = 512 * 1024;
const WDI_PREQUOTE_MAX_BYTES = 96 * 1024;
const WDI_RIGHTS_MAX_AGE_MS = 24 * 60 * 60 * 1000;

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
    request_fingerprint: record?.requestFingerprint ?? null,
    product_id: record?.productId ?? null,
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
      if (action === "wdi-prequote-freeze") return json(await this.wdiPrequoteFreeze(body));
      if (action === "wdi-prequote-readback") return json(await this.wdiPrequoteReadback(body));
      if (action === "capability-prequote-freeze") return json(await this.capabilityPrequoteFreeze(body));
      if (action === "capability-prequote-readback") return json(await this.capabilityPrequoteReadback(body));
      if (action === "structural-candidate-freeze") return json(await this.structuralCandidateFreeze(body));
      if (action === "structural-candidate-readback") return json(await this.structuralCandidateReadback(body));
      if (action === "claim") return json(await this.claim(body));
      if (action === "replay") return json(await this.deliveredReplay(body));
      if (action === "prepare") return json({ ok: await this.prepare(body) });
      if (action === "complete") return json({ ok: await this.complete(body) });
      if (action === "release") return json({ ok: await this.release(body) });
      if (action === "usage-reserve") return json(await this.usageReserve(body));
      if (action === "usage-finalize") return json({ ok: await this.usageFinalize(body) });
      if (action === "usage-release") return json({ ok: await this.usageRelease(body) });
      if (action === "audit-upsert") return json({ ok: await this.auditUpsert(body) });
      return json({ ok: false, error: "UNKNOWN_ACTION" }, 404);
    } catch (error) {
      console.error("[commerce-ledger-do] transition failed", error instanceof Error ? error.message : "unknown");
      return json({ ok: false, error: "LEDGER_TRANSITION_FAILED" }, 409);
    }
  }

  // Strictly separate from payment claims: this is a private, immutable,
  // pre-quote signed-answer byte freezer. It NEVER creates an x402 offer,
  // payment entitlement, claim token or a settlement record.
  async structuralCandidateFreeze(body) {
    const expiresAtMs=await assertStructuralCandidate(body.candidate,body.customerBytes,validateScope(body));
    const item={candidate:body.candidate,customerBytes:body.customerBytes,expiresAtMs};
    const key='structural-candidate:'+body.candidate.binding_hash;
    return this.ctx.storage.transaction(async txn=>{
      const existing=await txn.get(key);
      if(existing){
        if(JSON.stringify(existing)!==JSON.stringify(item))throw Error('STRUCTURAL_CANDIDATE_IMMUTABLE_CONFLICT');
        return {ok:true,disposition:'EXACT_REPLAY',binding_hash:body.candidate.binding_hash};
      }
      const entries=await txn.list({prefix:'structural-candidate:',limit:33});
      let retained=0;
      for(const [expiredKey,value]of entries){
        // These are expiring nonpayment candidates only. Never prune payment,
        // settlement, usage, audit or other provider-vault records.
        if(Number.isSafeInteger(value?.expiresAtMs)&&value.expiresAtMs<=Date.now())await txn.delete(expiredKey);
        else retained++;
      }
      if(retained>=32)throw Error('STRUCTURAL_CANDIDATE_VAULT_FULL');
      await txn.put(key,item);
      return {ok:true,disposition:'FROZEN',binding_hash:body.candidate.binding_hash};
    });
  }

  async structuralCandidateReadback(body) {
    const hash=validateRequestFingerprint(body.bindingHash);
    const value=await this.ctx.storage.get('structural-candidate:'+hash);
    if(!value||value.candidate?.binding_hash!==hash)throw Error('STRUCTURAL_CANDIDATE_NOT_FOUND');
    const expires=await assertStructuralCandidate(value.candidate,value.customerBytes,validateScope(body));
    if(value.expiresAtMs!==expires)throw Error('STRUCTURAL_CANDIDATE_EXPIRY_CONFLICT');
    return {ok:true,schema:STRUCTURAL_CANDIDATE_VERSION,...value,payment_authorized:false,settlement_attempted:false};
  }

  async wdiPrequoteFreeze(body) {
    const hash = validateRequestFingerprint(body.bindingHash);
    const queryHash = validateRequestFingerprint(body.queryHash);
    const rightsHash = validateRequestFingerprint(body.rightsHash);
    const receiptHash = validateRequestFingerprint(body.receiptHash);
    const answerHash = validateRequestFingerprint(body.answerHash);
    const termsHash = validateRequestFingerprint(body.termsHash);
    const generatedAt = body.rightsGeneratedAt;
    const bytes = body.customerBytes;
    const expiry = Date.parse(generatedAt);
    const now = Date.now();
    if (typeof generatedAt !== "string" ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(generatedAt) ||
        !Number.isFinite(expiry) || new Date(expiry).toISOString() !== generatedAt ||
        expiry > now + 5 * 60_000 || now >= expiry + WDI_RIGHTS_MAX_AGE_MS)
      throw new Error("WDI_PREQUOTE_RIGHTS_EXPIRED_OR_INVALID");
    if (typeof bytes !== "string" || !bytes ||
        new TextEncoder().encode(bytes).byteLength > WDI_PREQUOTE_MAX_BYTES ||
        await sha256Text(bytes) !== answerHash)
      throw new Error("WDI_PREQUOTE_CUSTOMER_BYTES_UNVERIFIED");
    const value = { bindingHash:hash, queryHash, rightsHash, receiptHash,
      answerHash, termsHash, rightsGeneratedAt:generatedAt,
      expiresAtMs:expiry + WDI_RIGHTS_MAX_AGE_MS, customerBytes:bytes };
    const key = "wdi-prequote:" + hash;
    return this.ctx.storage.transaction(async txn => {
      const existing = await txn.get(key);
      if (existing) {
        if (JSON.stringify(existing) !== JSON.stringify(value))
          throw new Error("WDI_PREQUOTE_IMMUTABLE_CONFLICT");
        return { ok:true, disposition:"EXACT_REPLAY", binding_hash:hash,
          answer_sha256:answerHash, expires_at_ms:value.expiresAtMs };
      }
      await txn.put(key, value);
      return { ok:true, disposition:"FROZEN", binding_hash:hash,
        answer_sha256:answerHash, expires_at_ms:value.expiresAtMs };
    });
  }

  async wdiPrequoteReadback(body) {
    const hash = validateRequestFingerprint(body.bindingHash);
    const value = await this.ctx.storage.get("wdi-prequote:" + hash);
    if (!value || value.bindingHash !== hash ||
        !Number.isSafeInteger(value.expiresAtMs) ||
        Date.now() >= value.expiresAtMs ||
        typeof value.customerBytes !== "string" ||
        await sha256Text(value.customerBytes) !== value.answerHash)
      throw new Error("WDI_PREQUOTE_MISSING_STALE_OR_CORRUPT");
    return { ok:true, schema:"geomacro.wdi-prequote-readback.v1",
      ...value, payment_authorized:false, settlement_attempted:false };
  }

  // Generic capability contract. Exactly the buyer-visible prepared answer
  // bytes are snapshotted BEFORE creating an x402 challenge. This is not a
  // quote authorization, payment claim, settlement or signing operation.
  async capabilityPrequoteFreeze(body) {
    const quote=body.quote;
    const customerBytes=body.customerBytes;
    const expires=await assertCapabilityPrequote(quote,body);
    if (!quote || typeof quote!=="object" || Array.isArray(quote) ||
        typeof quote.quote_id!=="string" || !PAYMENT_HASH_RE.test(quote.quote_id) ||
        typeof quote.request_fingerprint_sha256!=="string" ||
        !PAYMENT_HASH_RE.test(quote.request_fingerprint_sha256) ||
        typeof quote.prepared_answer_sha256!=="string" ||
        !PAYMENT_HASH_RE.test(quote.prepared_answer_sha256) ||
        quote.version!=="geomacro.capability-usdc.v2" ||
        quote.availability!=="VERIFIED_DELIVERABLE" ||
        quote.execution_authorized!==false ||
        !["coinbase_x402","circle_gateway_x402","xpay_x402","dexter_x402"].includes(quote.payment_rail) ||
        body.provider!==quote.payment_rail ||
        !["mainnet","production"].includes(body.providerEnvironment) ||
        typeof quote.amount_atomic!=="string" ||
        !/^[1-9][0-9]*$/u.test(quote.amount_atomic) ||
        BigInt(quote.amount_atomic)>50_000n ||
        typeof customerBytes!=="string" ||
        new TextEncoder().encode(customerBytes).byteLength>WDI_PREQUOTE_MAX_BYTES ||
        await sha256Text(customerBytes)!==quote.prepared_answer_sha256)
      throw Error("CAPABILITY_PREQUOTE_INVALID_OR_UNVERIFIED");
    const item={quote,customerBytes,expiresAtMs:expires};
    const key="capability-prequote:"+quote.quote_id;
    return this.ctx.storage.transaction(async txn=>{
      const existing=await txn.get(key);
      if(existing){
        if(JSON.stringify(existing)!==JSON.stringify(item))
          throw Error("CAPABILITY_PREQUOTE_IMMUTABLE_CONFLICT");
        return {ok:true,disposition:"EXACT_REPLAY",quote_id:quote.quote_id,
          prepared_answer_sha256:quote.prepared_answer_sha256};
      }
      // Bounded per-provider vault. Only expired, nonpayment prequotes are
      // pruned; payment, usage, audit and WDI records are never touched.
      const rows=await txn.list({prefix:'capability-prequote:',limit:CAPABILITY_PREQUOTE_LIMIT+1});
      let active=0;
      for(const [oldKey,value] of rows){
        if(!Number.isSafeInteger(value?.expiresAtMs))
          throw Error('CAPABILITY_PREQUOTE_STORAGE_UNVERIFIED');
        if(value.expiresAtMs<=Date.now())await txn.delete(oldKey);
        else active++;
      }
      if(active>=CAPABILITY_PREQUOTE_LIMIT)
        throw Error('CAPABILITY_PREQUOTE_CAPACITY_HELD');
      await txn.put(key,item);
      return {ok:true,disposition:"FROZEN",quote_id:quote.quote_id,
        prepared_answer_sha256:quote.prepared_answer_sha256};
    });
  }

  async capabilityPrequoteReadback(body) {
    const quoteId=validateRequestFingerprint(body.quoteId);
    const value=await this.ctx.storage.get("capability-prequote:"+quoteId);
    if(!value || value.quote?.quote_id!==quoteId ||
        !Number.isSafeInteger(value.expiresAtMs) ||
        Date.now()>=value.expiresAtMs ||
        typeof value.customerBytes!=="string" ||
        await sha256Text(value.customerBytes)!==value.quote?.prepared_answer_sha256)
      throw Error("CAPABILITY_PREQUOTE_MISSING_EXPIRED_OR_CORRUPT");
    await assertCapabilityPrequote(value.quote,body);
    return {ok:true,schema:"geomacro.capability-prequote.v1",
      ...value,payment_authorized:false,settlement_attempted:false};
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

  /** Delivered-only, read-only replay. Never creates a claim or transitions
   * a pending/failed/expired authorization into a billable settlement.
   * An expired quote is allowed only for this already-delivered exact payment.
   */
  async deliveredReplay(body) {
    const paymentFingerprint=validatePaymentFingerprint(body.paymentFingerprint);
    const requestFingerprint=validateRequestFingerprint(body.requestFingerprint);
    const productId=bounded(body.productId,128);
    const network=bounded(body.network,128);
    const asset=bounded(body.asset,128);
    const recipientHash=body.recipientHash==null?null:String(body.recipientHash).toLowerCase();
    const amountAtomic=body.amountAtomic==null?null:String(body.amountAtomic);
    const rail=bounded(body.rail,96);
    if(!productId||!network||!asset||!rail||
       !amountAtomic||!/^[1-9][0-9]*$/u.test(amountAtomic)||
       !PAYMENT_HASH_RE.test(String(recipientHash??"")))
      throw Error("DELIVERED_REPLAY_SCOPE_INVALID");
    const record=await this.ctx.storage.get(paymentKey(paymentFingerprint));
    if(!record||record.state!=="delivered"||record.responsePayload==null||
       !PAYMENT_HASH_RE.test(String(record.responseSha256??""))||
       record.requestFingerprint!==requestFingerprint ||
       record.productId!==productId || record.rail!==rail ||
       record.network!==network ||
       String(record.asset??"").toLowerCase()!==asset.toLowerCase() ||
       record.amountAtomic!==amountAtomic ||
       record.recipientHash!==recipientHash) {
      return {disposition:"NOT_FOUND",response_payload:null};
    }
    return {
      disposition:"REPLAY",response_payload:record.responsePayload,
      response_sha256:record.responseSha256,
      settlement_reference:record.settlementReference,
      settlement_network:record.settlementNetwork,
    };
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

  async usageReserve(body) {
    const paymentFingerprint = validatePaymentFingerprint(body.paymentFingerprint);
    const payerHash = String(body.payerHash ?? "").trim().toLowerCase();
    const amountAtomic = String(body.amountAtomic ?? "").trim();
    const maxDailyAmountAtomic = String(body.maxDailyAmountAtomic ?? "").trim();
    const maxDailyRequests = Number(body.maxDailyRequests);
    if (!PAYMENT_HASH_RE.test(payerHash)) throw new Error("INVALID_PAYER_HASH");
    if (!/^[0-9]+$/.test(amountAtomic) || BigInt(amountAtomic) <= 0n) throw new Error("INVALID_USAGE_AMOUNT");
    if (!/^[0-9]+$/.test(maxDailyAmountAtomic) || BigInt(maxDailyAmountAtomic) < BigInt(amountAtomic)) throw new Error("INVALID_DAILY_AMOUNT_LIMIT");
    if (!Number.isInteger(maxDailyRequests) || maxDailyRequests < 1 || maxDailyRequests > 100000) throw new Error("INVALID_DAILY_REQUEST_LIMIT");

    const day = new Date().toISOString().slice(0, 10);
    const reservationKey = `usage:${paymentFingerprint}`;
    const dailyKey = `usage-day:${day}:${payerHash}`;
    const now = Date.now();
    return this.ctx.storage.transaction(async (txn) => {
      const existing = await txn.get(reservationKey);
      if (existing) {
        const conflict = existing.payerHash !== payerHash || existing.amountAtomic !== amountAtomic || existing.maxDailyAmountAtomic !== maxDailyAmountAtomic || existing.maxDailyRequests !== maxDailyRequests;
        if (conflict) return { disposition: "CONFLICT" };
        if (existing.state === "manual_review") return { disposition: "MANUAL_REVIEW" };
        if (["reserved", "finalized"].includes(existing.state)) return { disposition: "RESERVED" };
      }

      const daily = (await txn.get(dailyKey)) ?? { amountAtomic: "0", requests: 0 };
      const nextAmount = BigInt(String(daily.amountAtomic ?? "0")) + BigInt(amountAtomic);
      const nextRequests = Number(daily.requests ?? 0) + 1;
      if (nextAmount > BigInt(maxDailyAmountAtomic)) return { disposition: "SPEND_LIMIT" };
      if (nextRequests > maxDailyRequests) return { disposition: "REQUEST_LIMIT" };

      await txn.put(dailyKey, { amountAtomic: nextAmount.toString(), requests: nextRequests, updatedAt: now });
      await txn.put(reservationKey, {
        paymentFingerprint,
        payerHash,
        amountAtomic,
        maxDailyAmountAtomic,
        maxDailyRequests,
        day,
        state: "reserved",
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      });
      return { disposition: "RESERVED" };
    });
  }

  async usageFinalize(body) {
    const paymentFingerprint = validatePaymentFingerprint(body.paymentFingerprint);
    const key = `usage:${paymentFingerprint}`;
    const now = Date.now();
    return this.ctx.storage.transaction(async (txn) => {
      const record = await txn.get(key);
      if (!record) return false;
      if (record.state === "finalized") return true;
      if (record.state !== "reserved") return false;
      await txn.put(key, { ...record, state: "finalized", updatedAt: now, finalizedAt: now });
      return true;
    });
  }

  async usageRelease(body) {
    const paymentFingerprint = validatePaymentFingerprint(body.paymentFingerprint);
    const manualReview = body.manualReview === true;
    const key = `usage:${paymentFingerprint}`;
    const now = Date.now();
    return this.ctx.storage.transaction(async (txn) => {
      const record = await txn.get(key);
      if (!record) return false;
      if (record.state === "released") return true;
      if (record.state === "manual_review") return manualReview;
      if (manualReview) {
        await txn.put(key, { ...record, state: "manual_review", updatedAt: now });
        return true;
      }
      if (record.state !== "reserved") return false;
      const dailyKey = `usage-day:${record.day}:${record.payerHash}`;
      const daily = (await txn.get(dailyKey)) ?? { amountAtomic: "0", requests: 0 };
      const remainingAmount = BigInt(String(daily.amountAtomic ?? "0")) - BigInt(record.amountAtomic);
      const remainingRequests = Number(daily.requests ?? 0) - 1;
      if (remainingAmount < 0n || remainingRequests < 0) throw new Error("USAGE_COUNTER_UNDERFLOW");
      await txn.put(dailyKey, { amountAtomic: remainingAmount.toString(), requests: remainingRequests, updatedAt: now });
      await txn.put(key, { ...record, state: "released", updatedAt: now, releasedAt: now });
      return true;
    });
  }

  async auditUpsert(body) {
    const paymentFingerprint = validatePaymentFingerprint(body.paymentFingerprint);
    const audit = body.audit;
    if (!audit || typeof audit !== "object" || Array.isArray(audit)) throw new Error("INVALID_AUDIT");
    if (String(audit.payment_fingerprint_sha256 ?? "").toLowerCase() !== paymentFingerprint) throw new Error("AUDIT_PAYMENT_FINGERPRINT_MISMATCH");
    const status = String(audit.status ?? "");
    if (!["prepared", "settled", "delivered", "manual_review", "failed"].includes(status)) throw new Error("INVALID_AUDIT_STATUS");
    const encoded = JSON.stringify(audit);
    if (new TextEncoder().encode(encoded).byteLength > 64 * 1024) throw new Error("AUDIT_TOO_LARGE");
    const key = `audit:${paymentFingerprint}`;
    const now = Date.now();
    return this.ctx.storage.transaction(async (txn) => {
      const existing = await txn.get(key);
      if (existing?.audit?.query_plan_hash && existing.audit.query_plan_hash !== audit.query_plan_hash) return false;
      await txn.put(key, { audit, updatedAt: now, createdAt: existing?.createdAt ?? now });
      return true;
    });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, service: "geomacro-commerce-ledger", storage: "durable_objects_sqlite", capabilities: ["delivery", "usage_guard", "product_audit"], wdi_prequote_contract_version: "geomacro.wdi-prequote-worker.v1", wdi_prequote_available: true, capability_prequote_contract_version: "geomacro.capability-prequote-worker.v1", capability_prequote_available: true, structural_candidate_contract_version: STRUCTURAL_CANDIDATE_VERSION, structural_quarterly_candidate_available: true });
    }
    const route = url.pathname.match(/^\/v1\/(delivery|usage|audit)\/([a-z-]+)$/);
    if (request.method !== "POST" || !route) {
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
      const section = route[1];
      const routeAction = route[2];
      if(scope.provider==='geomacro_structural_candidate'&&
         (section!=='delivery'||!['structural-candidate-freeze','structural-candidate-readback'].includes(routeAction)))
        return json({ok:false,error:'CANDIDATE_NAMESPACE_IS_NOT_PAYMENT'},400);
      const action = section === "delivery" ? routeAction : `${section}-${routeAction}`;
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
