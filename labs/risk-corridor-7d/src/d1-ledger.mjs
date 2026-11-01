// Dedicated D1 (staging) immutable delivery ledger. No Supabase dependency.
import {sha256} from "./crypto.mjs";
function validId(s) { return typeof s==="string" && /^[A-Za-z0-9][A-Za-z0-9_.:-]{1,127}$/.test(s); }
export async function authenticateD1(db, token) {
  if (typeof token!=="string"||!/^[a-f0-9]{64}$/.test(token)) return null;
  const hash=await sha256(token);
  const row=await db.prepare("SELECT t.tenant_id AS id, t.status, t.pricing_profile FROM gm_rc_api_keys k JOIN gm_rc_tenants t ON t.tenant_id=k.tenant_id WHERE k.token_sha256=? AND k.revoked_at IS NULL AND t.status='ACTIVE' AND k.scope='risk_gate' LIMIT 1").bind(hash).first();
  return row || null;
}
export function createD1Ledger(db,{leaseSeconds=120}={}) {
  if (!db?.prepare) throw Error("D1_LEDGER_UNCONFIGURED");
  return {
    async claim(a) {
      if (!validId(a.tenant_id)||!validId(a.request_id)||!/^[a-f0-9]{64}$/.test(a.request_hash)) throw Error("CLAIM_INVALID");
      await db.prepare("INSERT OR IGNORE INTO gm_rc_requests (tenant_id,request_id,request_hash,tier,quote_json,price_atomic,created_at,status) VALUES (?,?,?,?,?,?,?,'PENDING')")
        .bind(a.tenant_id,a.request_id,a.request_hash,a.tier,JSON.stringify(a.quote),a.quote.price_atomic,a.created_at).run();
      const row=await db.prepare("SELECT request_hash,status,response_json FROM gm_rc_requests WHERE tenant_id=? AND request_id=?")
        .bind(a.tenant_id,a.request_id).first();
      if (!row) throw Error("LEDGER_READ_UNAVAILABLE");
      if (row.request_hash!==a.request_hash) return {state:"CONFLICT"};
      if (row.status==="DELIVERED" && row.response_json) return {state:"REPLAY",response:JSON.parse(row.response_json)};
      const stale=new Date(Date.parse(a.created_at)-leaseSeconds*1000).toISOString();
      const owned=await db.prepare("UPDATE gm_rc_requests SET status='CLAIMED',claimed_at=? WHERE tenant_id=? AND request_id=? AND request_hash=? AND (status IN ('PENDING','FAILED_RETRYABLE') OR (status='CLAIMED' AND claimed_at<?)) RETURNING request_id")
        .bind(a.created_at,a.tenant_id,a.request_id,a.request_hash,stale).first();
      return owned?{state:"CLAIMED",claim_token:a.created_at}:{state:"IN_PROGRESS"};
    },
    async complete(a) {
      const updated=await db.prepare("UPDATE gm_rc_requests SET status='DELIVERED',response_json=?,verdict_id=?,delivered_at=? WHERE tenant_id=? AND request_id=? AND request_hash=? AND status='CLAIMED' AND claimed_at=? RETURNING request_id")
        .bind(JSON.stringify(a.response),a.verdict_id,a.delivered_at,a.tenant_id,a.request_id,a.request_hash,a.claim_token).first();
      return Boolean(updated);
    },
    async fail(a) {
      await db.prepare("UPDATE gm_rc_requests SET status='FAILED_RETRYABLE' WHERE tenant_id=? AND request_id=? AND request_hash=? AND status='CLAIMED' AND claimed_at=?")
        .bind(a.tenant_id,a.request_id,a.request_hash,a.claim_token).run();
    },
    // This is an audit state transition, NOT a money-moving operation.
    // External settlement recorder MUST independently verify actual onchain/PayPal finality.
    async recordVerifiedCollection(a, verifyPayment) {
      if (!validId(a.tenant_id)||!validId(a.request_id)||!validId(a.payment_ref)||
          typeof verifyPayment!=="function"||!await verifyPayment(a)) throw Error("PAYMENT_PROOF_NOT_VERIFIED");
      const row=await db.prepare("SELECT price_atomic,status FROM gm_rc_requests WHERE tenant_id=? AND request_id=?")
        .bind(a.tenant_id,a.request_id).first();
      if (!row || row.status!=="DELIVERED" || row.price_atomic===null ||
          row.price_atomic!==a.amount_atomic) throw Error("COLLECTION_NOT_DUE");
      await db.prepare("INSERT OR IGNORE INTO gm_rc_collections (tenant_id,request_id,payment_ref,amount_atomic,collected_at,status) VALUES (?,?,?,?,?,'COLLECTED')")
        .bind(a.tenant_id,a.request_id,a.payment_ref,a.amount_atomic,a.collected_at).run();
      // The UNIQUE(tenant_id, request_id) invariant also blocks a different receipt from silently succeeding.
      const saved=await db.prepare("SELECT payment_ref,amount_atomic FROM gm_rc_collections WHERE tenant_id=? AND request_id=?")
        .bind(a.tenant_id,a.request_id).first();
      if (!saved || saved.payment_ref!==a.payment_ref || saved.amount_atomic!==a.amount_atomic)
        throw Error("COLLECTION_RECEIPT_CONFLICT");
      const conflicts=await db.prepare("SELECT COUNT(*) AS n FROM gm_rc_collections WHERE tenant_id=? AND request_id=? AND status='COLLECTED'")
        .bind(a.tenant_id,a.request_id).first();
      if (Number(conflicts?.n)!==1) throw Error("DUPLICATE_COLLECTION_REQUIRES_REVIEW");
      return true;
    },
    async recordVerifiedRefund(a,verifyRefund) {
      if (!validId(a.tenant_id)||!validId(a.request_id)||!validId(a.refund_ref)||
          typeof verifyRefund!=="function"||!await verifyRefund(a)) throw Error("REFUND_PROOF_NOT_VERIFIED");
      const collection=await db.prepare("SELECT amount_atomic FROM gm_rc_collections WHERE tenant_id=? AND request_id=? AND payment_ref=? AND status='COLLECTED'")
        .bind(a.tenant_id,a.request_id,a.payment_ref).first();
      if (!collection || collection.amount_atomic!==a.amount_atomic) throw Error("REFUND_NOT_MATCHED");
      await db.prepare("INSERT OR IGNORE INTO gm_rc_refunds (tenant_id,request_id,payment_ref,refund_ref,amount_atomic,refunded_at) VALUES (?,?,?,?,?,?)")
        .bind(a.tenant_id,a.request_id,a.payment_ref,a.refund_ref,a.amount_atomic,a.refunded_at).run();
      // Partial refund intentionally not accepted until a separately approved accounting schema.
      return true;
    },
    async monthlySummary(monthStart,monthEnd) {
      // UTC half-open [start,end); integer micro-USDC sum not JavaScript floating point.
      const rows=await db.prepare("SELECT c.tenant_id,c.request_id,c.amount_atomic AS collected_atomic, COALESCE(r.amount_atomic,'0') AS refunded_atomic FROM gm_rc_collections c LEFT JOIN gm_rc_refunds r ON r.tenant_id=c.tenant_id AND r.request_id=c.request_id AND r.payment_ref=c.payment_ref WHERE c.collected_at>=? AND c.collected_at<? AND c.status='COLLECTED' ORDER BY c.tenant_id,c.request_id")
        .bind(monthStart,monthEnd).all();
      const byTenant=new Map();
      for (const row of rows.results||[]) {
        const old=byTenant.get(row.tenant_id)||{tenant_id:row.tenant_id,collected_atomic:0n,refunded_atomic:0n,net_atomic:0n,checks:0};
        const col=BigInt(row.collected_atomic),ref=BigInt(row.refunded_atomic);
        if (ref<0n||col<ref) throw Error("ACCOUNTING_MISMATCH");
        old.collected_atomic+=col;old.refunded_atomic+=ref;old.net_atomic+=col-ref;old.checks++;
        byTenant.set(row.tenant_id,old);
      }
      return [...byTenant.values()].map(x=>({...x,collected_atomic:x.collected_atomic.toString(),
        refunded_atomic:x.refunded_atomic.toString(),net_atomic:x.net_atomic.toString()}));
    }
  };
}
