#!/usr/bin/env node
import fs from "node:fs/promises";

async function read(path) {
  return fs.readFile(path, "utf8");
}

async function write(path, value) {
  await fs.writeFile(path, value, "utf8");
}

function replaceOnce(source, needle, replacement, label) {
  const first = source.indexOf(needle);
  if (first < 0) throw new Error(`CUTOVER_PATCH_MISSING:${label}`);
  if (source.indexOf(needle, first + needle.length) >= 0) {
    throw new Error(`CUTOVER_PATCH_AMBIGUOUS:${label}`);
  }
  return source.slice(0, first) + replacement + source.slice(first + needle.length);
}

async function patchStructuralContext() {
  const path = "src/lib/structural-context.server.ts";
  let source = await read(path);
  source = replaceOnce(
    source,
    '} from "./b2-structural.server";\n',
    '} from "./b2-structural.server";\nimport { supabaseReadFallbackAllowed } from "./supabase-runtime-mode.server";\n',
    "structural-import",
  );
  source = replaceOnce(
    source,
    "function getHistoricalClient(): SupabaseClient | null {\n  if (cachedHistoricalClient) return cachedHistoricalClient;\n",
    "function getHistoricalClient(): SupabaseClient | null {\n  if (!supabaseReadFallbackAllowed()) return null;\n  if (cachedHistoricalClient) return cachedHistoricalClient;\n",
    "structural-standby-guard",
  );
  await write(path, source);
}

async function patchAgentCommerceDefault() {
  const path = "src/lib/agent-commerce-delivery.server.ts";
  let source = await read(path);
  source = replaceOnce(
    source,
    'const raw = String(process.env.GEOMACRO_COMMERCE_LEDGER_BACKEND ?? "supabase")\n',
    'const raw = String(\n    process.env.GEOMACRO_COMMERCE_LEDGER_BACKEND ??\n      (process.env.NODE_ENV === "production" ? "durable_object" : "supabase"),\n  )\n',
    "agent-commerce-production-default",
  );
  await write(path, source);
}

async function patchCoinbaseDelivery() {
  const path = "src/lib/coinbase-x402.server.ts";
  let source = await read(path);
  source = replaceOnce(
    source,
    'import { requireRiskSupabase } from "./risk-supabase.server";\n',
    'import { requireRiskSupabase } from "./risk-supabase.server";\nimport {\n  claimAgentCommerceDelivery,\n  completeAgentCommerceDelivery,\n  prepareAgentCommerceDelivery,\n  releaseAgentCommerceDelivery,\n} from "./agent-commerce-delivery.server";\n',
    "coinbase-agent-commerce-import",
  );

  const startMarker = "export async function claimCoinbaseX402Delivery(input: {";
  const endMarker = "export async function persistCoinbaseSettlementTelemetry(input: {";
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker);
  if (start < 0 || end <= start) throw new Error("CUTOVER_PATCH_MISSING:coinbase-delivery-block");

  const replacement = `export async function claimCoinbaseX402Delivery(input: {\n  paymentFingerprint: string;\n  requestFingerprint: string;\n  clientRequestId?: string | null;\n  config: CoinbaseX402Config;\n}) {\n  const row = await claimAgentCommerceDelivery({\n    provider: "coinbase_x402",\n    providerEnvironment: input.config.commercialEnvironment,\n    paymentFingerprint: input.paymentFingerprint,\n    requestFingerprint: input.requestFingerprint,\n    productId: "geomacro_coinbase_x402_v1",\n    clientRequestId: input.clientRequestId ?? null,\n    sourceChannel: "coinbase_x402",\n    rail: "coinbase_cdp_exact",\n    network: input.config.network,\n    asset: input.config.asset,\n    amountAtomic: input.config.amountAtomic,\n    recipientReference: input.config.payTo,\n  });\n  return {\n    disposition: row.disposition,\n    claim_token: row.claim_token,\n    response_payload: row.response_payload,\n    settlement_tx: row.settlement_reference,\n    settlement_network: row.settlement_network,\n  };\n}\n\nexport async function prepareCoinbaseX402Delivery(input: {\n  paymentFingerprint: string;\n  claimToken: string;\n  responsePayload: unknown;\n}) {\n  return prepareAgentCommerceDelivery({\n    provider: "coinbase_x402",\n    providerEnvironment: "mainnet",\n    paymentFingerprint: input.paymentFingerprint,\n    claimToken: input.claimToken,\n    responsePayload: input.responsePayload,\n  });\n}\n\nexport async function completeCoinbaseX402Delivery(input: {\n  paymentFingerprint: string;\n  claimToken: string;\n  payer: string | null;\n  settlementTx: string | null;\n  settlementNetwork: string | null;\n}) {\n  if (!input.settlementTx) throw new Error("COINBASE_X402_SETTLEMENT_REFERENCE_REQUIRED");\n  return completeAgentCommerceDelivery({\n    provider: "coinbase_x402",\n    providerEnvironment: "mainnet",\n    paymentFingerprint: input.paymentFingerprint,\n    claimToken: input.claimToken,\n    payerReference: input.payer,\n    settlementReference: input.settlementTx,\n    settlementNetwork: input.settlementNetwork,\n  });\n}\n\nexport async function releaseCoinbaseX402DeliveryForRetry(input: {\n  paymentFingerprint: string;\n  claimToken: string;\n  failureCode: string;\n  manualReview?: boolean;\n}) {\n  try {\n    await releaseAgentCommerceDelivery({\n      provider: "coinbase_x402",\n      providerEnvironment: "mainnet",\n      paymentFingerprint: input.paymentFingerprint,\n      claimToken: input.claimToken,\n      failureCode: input.failureCode,\n      manualReview: input.manualReview ?? false,\n    });\n  } catch (error) {\n    console.error("[coinbase-x402] delivery release failed", error);\n  }\n}\n\n`;

  source = source.slice(0, start) + replacement + source.slice(end);
  await write(path, source);
}

async function patchCommerceWorker() {
  const path = "workers/commerce-ledger/src/index.mjs";
  let source = await read(path);

  source = replaceOnce(
    source,
    '      if (action === "release") return json({ ok: await this.release(body) });\n      return json({ ok: false, error: "UNKNOWN_ACTION" }, 404);',
    '      if (action === "release") return json({ ok: await this.release(body) });\n      if (action === "usage-reserve") return json(await this.usageReserve(body));\n      if (action === "usage-finalize") return json({ ok: await this.usageFinalize(body) });\n      if (action === "usage-release") return json({ ok: await this.usageRelease(body) });\n      if (action === "audit-upsert") return json({ ok: await this.auditUpsert(body) });\n      return json({ ok: false, error: "UNKNOWN_ACTION" }, 404);',
    "worker-action-dispatch",
  );

  const classEnd = "\n}\n\nexport default {";
  const insertAt = source.lastIndexOf(classEnd);
  if (insertAt < 0) throw new Error("CUTOVER_PATCH_MISSING:worker-class-end");
  const methods = `\n\n  async usageReserve(body) {\n    const paymentFingerprint = validatePaymentFingerprint(body.paymentFingerprint);\n    const payerHash = String(body.payerHash ?? "").trim().toLowerCase();\n    const amountAtomic = String(body.amountAtomic ?? "").trim();\n    const maxDailyAmountAtomic = String(body.maxDailyAmountAtomic ?? "").trim();\n    const maxDailyRequests = Number(body.maxDailyRequests);\n    if (!PAYMENT_HASH_RE.test(payerHash)) throw new Error("INVALID_PAYER_HASH");\n    if (!/^[0-9]+$/.test(amountAtomic) || BigInt(amountAtomic) <= 0n) throw new Error("INVALID_USAGE_AMOUNT");\n    if (!/^[0-9]+$/.test(maxDailyAmountAtomic) || BigInt(maxDailyAmountAtomic) < BigInt(amountAtomic)) throw new Error("INVALID_DAILY_AMOUNT_LIMIT");\n    if (!Number.isInteger(maxDailyRequests) || maxDailyRequests < 1 || maxDailyRequests > 100000) throw new Error("INVALID_DAILY_REQUEST_LIMIT");\n\n    const day = new Date().toISOString().slice(0, 10);\n    const reservationKey = \`usage:\${paymentFingerprint}\`;\n    const dailyKey = \`usage-day:\${day}:\${payerHash}\`;\n    const now = Date.now();\n    return this.ctx.storage.transaction(async (txn) => {\n      const existing = await txn.get(reservationKey);\n      if (existing) {\n        const conflict = existing.payerHash !== payerHash || existing.amountAtomic !== amountAtomic || existing.maxDailyAmountAtomic !== maxDailyAmountAtomic || existing.maxDailyRequests !== maxDailyRequests;\n        if (conflict) return { disposition: "CONFLICT" };\n        if (existing.state === "manual_review") return { disposition: "MANUAL_REVIEW" };\n        if (["reserved", "finalized"].includes(existing.state)) return { disposition: "RESERVED" };\n      }\n\n      const daily = (await txn.get(dailyKey)) ?? { amountAtomic: "0", requests: 0 };\n      const nextAmount = BigInt(String(daily.amountAtomic ?? "0")) + BigInt(amountAtomic);\n      const nextRequests = Number(daily.requests ?? 0) + 1;\n      if (nextAmount > BigInt(maxDailyAmountAtomic)) return { disposition: "SPEND_LIMIT" };\n      if (nextRequests > maxDailyRequests) return { disposition: "REQUEST_LIMIT" };\n\n      await txn.put(dailyKey, { amountAtomic: nextAmount.toString(), requests: nextRequests, updatedAt: now });\n      await txn.put(reservationKey, {\n        paymentFingerprint,\n        payerHash,\n        amountAtomic,\n        maxDailyAmountAtomic,\n        maxDailyRequests,\n        day,\n        state: "reserved",\n        createdAt: existing?.createdAt ?? now,\n        updatedAt: now,\n      });\n      return { disposition: "RESERVED" };\n    });\n  }\n\n  async usageFinalize(body) {\n    const paymentFingerprint = validatePaymentFingerprint(body.paymentFingerprint);\n    const key = \`usage:\${paymentFingerprint}\`;\n    const now = Date.now();\n    return this.ctx.storage.transaction(async (txn) => {\n      const record = await txn.get(key);\n      if (!record) return false;\n      if (record.state === "finalized") return true;\n      if (record.state !== "reserved") return false;\n      await txn.put(key, { ...record, state: "finalized", updatedAt: now, finalizedAt: now });\n      return true;\n    });\n  }\n\n  async usageRelease(body) {\n    const paymentFingerprint = validatePaymentFingerprint(body.paymentFingerprint);\n    const manualReview = body.manualReview === true;\n    const key = \`usage:\${paymentFingerprint}\`;\n    const now = Date.now();\n    return this.ctx.storage.transaction(async (txn) => {\n      const record = await txn.get(key);\n      if (!record) return false;\n      if (record.state === "released") return true;\n      if (record.state === "manual_review") return manualReview;\n      if (manualReview) {\n        await txn.put(key, { ...record, state: "manual_review", updatedAt: now });\n        return true;\n      }\n      if (record.state !== "reserved") return false;\n      const dailyKey = \`usage-day:\${record.day}:\${record.payerHash}\`;\n      const daily = (await txn.get(dailyKey)) ?? { amountAtomic: "0", requests: 0 };\n      const remainingAmount = BigInt(String(daily.amountAtomic ?? "0")) - BigInt(record.amountAtomic);\n      const remainingRequests = Number(daily.requests ?? 0) - 1;\n      if (remainingAmount < 0n || remainingRequests < 0) throw new Error("USAGE_COUNTER_UNDERFLOW");\n      await txn.put(dailyKey, { amountAtomic: remainingAmount.toString(), requests: remainingRequests, updatedAt: now });\n      await txn.put(key, { ...record, state: "released", updatedAt: now, releasedAt: now });\n      return true;\n    });\n  }\n\n  async auditUpsert(body) {\n    const paymentFingerprint = validatePaymentFingerprint(body.paymentFingerprint);\n    const audit = body.audit;\n    if (!audit || typeof audit !== "object" || Array.isArray(audit)) throw new Error("INVALID_AUDIT");\n    if (String(audit.payment_fingerprint_sha256 ?? "").toLowerCase() !== paymentFingerprint) throw new Error("AUDIT_PAYMENT_FINGERPRINT_MISMATCH");\n    const status = String(audit.status ?? "");\n    if (!["prepared", "settled", "delivered", "manual_review", "failed"].includes(status)) throw new Error("INVALID_AUDIT_STATUS");\n    const encoded = JSON.stringify(audit);\n    if (new TextEncoder().encode(encoded).byteLength > 64 * 1024) throw new Error("AUDIT_TOO_LARGE");\n    const key = \`audit:\${paymentFingerprint}\`;\n    const now = Date.now();\n    return this.ctx.storage.transaction(async (txn) => {\n      const existing = await txn.get(key);\n      if (existing?.audit?.query_plan_hash && existing.audit.query_plan_hash !== audit.query_plan_hash) return false;\n      await txn.put(key, { audit, updatedAt: now, createdAt: existing?.createdAt ?? now });\n      return true;\n    });\n  }`;
  source = source.slice(0, insertAt) + methods + source.slice(insertAt);

  source = replaceOnce(
    source,
    '      return json({ ok: true, service: "geomacro-commerce-ledger", storage: "durable_objects_sqlite" });',
    '      return json({ ok: true, service: "geomacro-commerce-ledger", storage: "durable_objects_sqlite", capabilities: ["delivery", "usage_guard", "product_audit"] });',
    "worker-health-capabilities",
  );

  source = replaceOnce(
    source,
    '    if (request.method !== "POST" || !url.pathname.startsWith("/v1/delivery/")) {\n      return json({ ok: false, error: "NOT_FOUND" }, 404);\n    }',
    '    const route = url.pathname.match(/^\\/v1\\/(delivery|usage|audit)\\/([a-z-]+)$/);\n    if (request.method !== "POST" || !route) {\n      return json({ ok: false, error: "NOT_FOUND" }, 404);\n    }',
    "worker-route-match",
  );

  source = replaceOnce(
    source,
    '      const action = url.pathname.split("/").filter(Boolean).at(-1);\n      return stub.fetch(`https://ledger.internal/${action}`, {',
    '      const section = route[1];\n      const routeAction = route[2];\n      const action = section === "delivery" ? routeAction : `${section}-${routeAction}`;\n      return stub.fetch(`https://ledger.internal/${action}`, {',
    "worker-route-dispatch",
  );

  await write(path, source);
}

await patchStructuralContext();
await patchAgentCommerceDefault();
await patchCoinbaseDelivery();
await patchCommerceWorker();
console.log("Supabase standby cutover codemod applied successfully.");
