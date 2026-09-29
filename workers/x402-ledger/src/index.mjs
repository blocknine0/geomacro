const LEASE_MS = 5 * 60 * 1000;
const MAX_SKEW_SECONDS = 60;
const HEX64 = /^[a-f0-9]{64}$/;
const TX_HASH = /^0x[a-fA-F0-9]{64}$/;
const NETWORKS = new Set(["eip155:84532", "eip155:8453"]);
const ENVIRONMENTS = new Set(["testnet", "mainnet"]);
const textEncoder = new TextEncoder();

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function hex(bytes) {
  return [...new Uint8Array(bytes)].map((v) => v.toString(16).padStart(2, "0")).join("");
}

async function sha256(value) {
  return hex(await crypto.subtle.digest("SHA-256", textEncoder.encode(value)));
}

async function hmacHex(secret, value) {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(await crypto.subtle.sign("HMAC", key, textEncoder.encode(value)));
}

function timingSafeHexEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string" || left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

async function authorize(request, env, bodyText) {
  const secret = String(env.LEDGER_SHARED_SECRET ?? "");
  if (secret.length < 32) return false;
  const stamp = request.headers.get("x-geomacro-timestamp") ?? "";
  const signature = (request.headers.get("x-geomacro-signature") ?? "").toLowerCase();
  if (!/^\d{10}$/.test(stamp) || !HEX64.test(signature)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(stamp)) > MAX_SKEW_SECONDS) return false;
  const url = new URL(request.url);
  const bodyHash = await sha256(bodyText);
  const signed = `${stamp}\n${request.method.toUpperCase()}\n${url.pathname}\n${bodyHash}`;
  const expected = await hmacHex(secret, signed);
  return timingSafeHexEqual(signature, expected);
}

function validClaim(input) {
  return input &&
    HEX64.test(String(input.payment_fingerprint ?? "")) &&
    HEX64.test(String(input.request_fingerprint ?? "")) &&
    HEX64.test(String(input.pay_to_hash ?? "")) &&
    ENVIRONMENTS.has(String(input.environment ?? "")) &&
    NETWORKS.has(String(input.network ?? "")) &&
    typeof input.asset === "string" && input.asset.length >= 4 && input.asset.length <= 128 &&
    /^\d+$/.test(String(input.amount_atomic ?? "")) && BigInt(String(input.amount_atomic)) > 0n &&
    (input.client_request_id == null || (typeof input.client_request_id === "string" && input.client_request_id.length >= 4 && input.client_request_id.length <= 128));
}

function bindingMatches(row, input) {
  return row.request_fingerprint_sha256 === input.request_fingerprint &&
    row.environment === input.environment &&
    row.network === input.network &&
    String(row.asset).toLowerCase() === String(input.asset).toLowerCase() &&
    String(row.amount_atomic) === String(input.amount_atomic) &&
    row.pay_to_hash === input.pay_to_hash;
}

function claimResult(disposition, row = null, token = null) {
  let responsePayload = null;
  if (row?.response_payload) {
    try { responsePayload = JSON.parse(row.response_payload); } catch { responsePayload = null; }
  }
  return {
    disposition,
    claim_token: token,
    response_payload: responsePayload,
    settlement_tx: row?.settlement_tx ?? null,
    settlement_network: row?.settlement_network ?? null,
  };
}

async function readDelivery(db, paymentFingerprint) {
  return db.prepare(
    `SELECT payment_fingerprint_sha256, request_fingerprint_sha256, client_request_id,
            environment, network, asset, amount_atomic, pay_to_hash, state, claim_token,
            lease_expires_at_ms, response_payload, response_sha256, settlement_tx,
            settlement_network, failure_code, updated_at_ms
       FROM coinbase_x402_deliveries
      WHERE payment_fingerprint_sha256 = ?1`,
  ).bind(paymentFingerprint).first();
}

async function claim(db, input) {
  if (!validClaim(input)) return { status: 400, body: { ok: false, code: "INVALID_CLAIM" } };
  const now = Date.now();
  const token = crypto.randomUUID();
  const insert = await db.prepare(
    `INSERT OR IGNORE INTO coinbase_x402_deliveries (
       payment_fingerprint_sha256, request_fingerprint_sha256, client_request_id,
       environment, network, asset, amount_atomic, pay_to_hash, state, claim_token,
       lease_expires_at_ms, created_at_ms, updated_at_ms
     ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,'processing',?9,?10,?11,?11)`,
  ).bind(
    input.payment_fingerprint,
    input.request_fingerprint,
    input.client_request_id ?? null,
    input.environment,
    input.network,
    input.asset,
    String(input.amount_atomic),
    input.pay_to_hash,
    token,
    now + LEASE_MS,
    now,
  ).run();
  if (Number(insert.meta?.changes ?? 0) === 1) {
    return { status: 200, body: { ok: true, ...claimResult("CLAIMED", null, token) } };
  }

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const row = await readDelivery(db, input.payment_fingerprint);
    if (!row) return { status: 503, body: { ok: false, code: "CLAIM_ROW_MISSING" } };
    if (!bindingMatches(row, input)) return { status: 200, body: { ok: true, ...claimResult("CONFLICT", row) } };
    if (row.state === "delivered" && row.response_payload) return { status: 200, body: { ok: true, ...claimResult("REPLAY", row) } };
    if (row.state === "manual_review") return { status: 200, body: { ok: true, ...claimResult("MANUAL_REVIEW", row) } };

    const now2 = Date.now();
    if (row.state === "prepared") {
      if (row.lease_expires_at_ms != null && Number(row.lease_expires_at_ms) > now2) {
        return { status: 200, body: { ok: true, ...claimResult("IN_PROGRESS", row) } };
      }
      const locked = await db.prepare(
        `UPDATE coinbase_x402_deliveries
            SET state='manual_review', claim_token=NULL, lease_expires_at_ms=NULL,
                failure_code='PREPARED_LEASE_EXPIRED_RECONCILIATION_REQUIRED', updated_at_ms=?1
          WHERE payment_fingerprint_sha256=?2 AND state='prepared' AND updated_at_ms=?3`,
      ).bind(now2, input.payment_fingerprint, row.updated_at_ms).run();
      if (Number(locked.meta?.changes ?? 0) === 1) {
        return { status: 200, body: { ok: true, ...claimResult("MANUAL_REVIEW", { ...row, state: "manual_review" }) } };
      }
      continue;
    }

    const reclaimable = row.state === "failed" ||
      (row.state === "processing" && (row.lease_expires_at_ms == null || Number(row.lease_expires_at_ms) <= now2));
    if (reclaimable) {
      const newToken = crypto.randomUUID();
      const nextState = row.response_payload ? "prepared" : "processing";
      const reclaimed = await db.prepare(
        `UPDATE coinbase_x402_deliveries
            SET state=?1, claim_token=?2, lease_expires_at_ms=?3, failure_code=NULL, updated_at_ms=?4
          WHERE payment_fingerprint_sha256=?5 AND updated_at_ms=?6
            AND (state='failed' OR (state='processing' AND (lease_expires_at_ms IS NULL OR lease_expires_at_ms<=?4)))`,
      ).bind(nextState, newToken, now2 + LEASE_MS, now2, input.payment_fingerprint, row.updated_at_ms).run();
      if (Number(reclaimed.meta?.changes ?? 0) === 1) {
        return { status: 200, body: { ok: true, ...claimResult("CLAIMED", row, newToken) } };
      }
      continue;
    }

    return { status: 200, body: { ok: true, ...claimResult("IN_PROGRESS", row) } };
  }
  return { status: 409, body: { ok: false, code: "CLAIM_RACE_RETRY" } };
}

async function prepare(db, input) {
  const payment = String(input?.payment_fingerprint ?? "");
  const token = String(input?.claim_token ?? "");
  const payloadJson = String(input?.response_payload_json ?? "");
  const expectedHash = String(input?.response_sha256 ?? "");
  if (!HEX64.test(payment) || !/^[0-9a-f-]{36}$/i.test(token) || !payloadJson || payloadJson.length > 2_000_000 || !HEX64.test(expectedHash)) {
    return { status: 400, body: { ok: false, code: "INVALID_PREPARE" } };
  }
  let parsed;
  try { parsed = JSON.parse(payloadJson); } catch { return { status: 400, body: { ok: false, code: "INVALID_RESPONSE_JSON" } }; }
  if (!parsed || typeof parsed !== "object") return { status: 400, body: { ok: false, code: "INVALID_RESPONSE_PAYLOAD" } };
  if ((await sha256(payloadJson)) !== expectedHash) return { status: 400, body: { ok: false, code: "RESPONSE_HASH_MISMATCH" } };
  const now = Date.now();
  const result = await db.prepare(
    `UPDATE coinbase_x402_deliveries
        SET state='prepared', response_payload=?1, response_sha256=?2,
            updated_at_ms=?3, lease_expires_at_ms=?4
      WHERE payment_fingerprint_sha256=?5 AND claim_token=?6 AND state IN ('processing','prepared')`,
  ).bind(payloadJson, expectedHash, now, now + LEASE_MS, payment, token).run();
  if (Number(result.meta?.changes ?? 0) !== 1) return { status: 409, body: { ok: false, code: "PREPARE_LOST_CLAIM" } };
  return { status: 200, body: { ok: true, response_sha256: expectedHash } };
}

async function complete(db, input) {
  const payment = String(input?.payment_fingerprint ?? "");
  const token = String(input?.claim_token ?? "");
  const payerHash = input?.payer_hash == null ? null : String(input.payer_hash);
  const tx = String(input?.settlement_tx ?? "");
  const network = String(input?.settlement_network ?? "");
  if (!HEX64.test(payment) || !/^[0-9a-f-]{36}$/i.test(token) || (payerHash !== null && !HEX64.test(payerHash)) || !TX_HASH.test(tx) || network.length < 1 || network.length > 80) {
    return { status: 400, body: { ok: false, code: "INVALID_COMPLETE" } };
  }
  const now = Date.now();
  try {
    const result = await db.prepare(
      `UPDATE coinbase_x402_deliveries
          SET state='delivered', claim_token=NULL, lease_expires_at_ms=NULL,
              payer_reference_hash=?1, settlement_tx=?2, settlement_network=?3,
              failure_code=NULL, settled_at_ms=?4, delivered_at_ms=?4, updated_at_ms=?4
        WHERE payment_fingerprint_sha256=?5 AND claim_token=?6
          AND state='prepared' AND response_payload IS NOT NULL`,
    ).bind(payerHash, tx, network, now, payment, token).run();
    if (Number(result.meta?.changes ?? 0) !== 1) return { status: 409, body: { ok: false, code: "COMPLETE_LOST_CLAIM" } };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { status: 409, body: { ok: false, code: "SETTLEMENT_TX_CONFLICT", detail: detail.slice(0, 160) } };
  }
  return { status: 200, body: { ok: true } };
}

async function release(db, input) {
  const payment = String(input?.payment_fingerprint ?? "");
  const token = String(input?.claim_token ?? "");
  const failure = String(input?.failure_code ?? "UNKNOWN").slice(0, 160);
  const manual = input?.manual_review === true;
  if (!HEX64.test(payment) || !/^[0-9a-f-]{36}$/i.test(token)) return { status: 400, body: { ok: false, code: "INVALID_RELEASE" } };
  const result = await db.prepare(
    `UPDATE coinbase_x402_deliveries
        SET state=?1, claim_token=NULL, lease_expires_at_ms=NULL, failure_code=?2, updated_at_ms=?3
      WHERE payment_fingerprint_sha256=?4 AND claim_token=?5 AND state IN ('processing','prepared')`,
  ).bind(manual ? "manual_review" : "failed", failure, Date.now(), payment, token).run();
  return { status: 200, body: { ok: true, released: Number(result.meta?.changes ?? 0) === 1 } };
}

async function route(request, env) {
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/health") {
    return json({ ok: true, service: "geomacro-x402-ledger", storage: "cloudflare-d1" });
  }
  if (request.method !== "POST") return json({ ok: false, code: "METHOD_NOT_ALLOWED" }, 405);
  const bodyText = await request.text();
  if (!(await authorize(request, env, bodyText))) return json({ ok: false, code: "UNAUTHORIZED" }, 401);
  if (bodyText.length > 2_200_000) return json({ ok: false, code: "BODY_TOO_LARGE" }, 413);
  let input;
  try { input = JSON.parse(bodyText); } catch { return json({ ok: false, code: "INVALID_JSON" }, 400); }

  let result;
  if (url.pathname === "/v1/claim") result = await claim(env.DB, input);
  else if (url.pathname === "/v1/prepare") result = await prepare(env.DB, input);
  else if (url.pathname === "/v1/complete") result = await complete(env.DB, input);
  else if (url.pathname === "/v1/release") result = await release(env.DB, input);
  else return json({ ok: false, code: "NOT_FOUND" }, 404);
  return json(result.body, result.status);
}

export default {
  async fetch(request, env) {
    try {
      if (!env?.DB) return json({ ok: false, code: "D1_BINDING_MISSING" }, 503);
      return await route(request, env);
    } catch (error) {
      console.error("[x402-ledger] unhandled", error instanceof Error ? error.stack ?? error.message : String(error));
      return json({ ok: false, code: "LEDGER_INTERNAL_ERROR" }, 500);
    }
  },
};
