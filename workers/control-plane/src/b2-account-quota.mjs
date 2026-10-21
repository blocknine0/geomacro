// Permanent shared-account B2 operation reservation (D1 atomic UPSERT).
// Counts attempts before B2 network I/O, not just successful responses.
// Deliberately conservative: ambiguous retries are *not* refunded.
export const B2_DAILY_LIMITS = Object.freeze({
  total: 100, GET: 45, PUT: 55, HEAD: 10, NATIVE_AUTH: 10,
});
// Reserve at least 35/45 shared GET tickets for trusted producers and
// verified recovery. All THREE currently deployed public B2 cold-read Workers
// must count against the SAME 10-ticket ceiling. This is based on total GET
// reservations, so producer use can only make the public allocation smaller;
// it can never let a public Worker exhaust producer headroom.
export const B2_PUBLIC_EDGE_GLOBAL_GET_CEILING = 10;
// The provider account may still have a much smaller, independently enforced
// cap. These are conservative *shared-ledger* admission ceilings, NOT claimed
// new Backblaze allowance. App fallbacks may never exhaust all GET tickets
// before the protected historical-version and signed publishers can run.
export const B2_APP_STRUCTURAL_SHARED_GET_CEILING = 10;
export const B2_APP_PRIVATE_METADATA_SHARED_GET_CEILING = 18;
const APP_PRIVATE_METADATA_WORKFLOWS = new Set([
  "app_private_source_rights","app_private_source_status",
]);
const PUBLIC_B2_READ_WORKFLOWS = new Set([
  "intelligence_public_edge",
  "global_risk_public_edge",
  "risk_indices_public_edge",
]);
const KINDS = Object.freeze(["GET", "PUT", "HEAD", "NATIVE_AUTH"]);
const WORKFLOW = /^[a-z][a-z0-9_-]{1,47}$/u;
const COL = Object.freeze({
  GET: "get_requests", PUT: "put_requests",
  HEAD: "head_requests", NATIVE_AUTH: "native_auth_requests",
});

// One D1 statement is the account-wide serialization point, including across
// GitHub jobs/Workers. Never do SELECT then UPDATE or caller-controlled limits.
export const ATOMIC_B2_QUOTA_SQL = `
INSERT INTO b2_account_daily_request_quota
(day_utc,total_requests,get_requests,put_requests,head_requests,native_auth_requests,updated_at)
VALUES (?,1,?,?,?,?,?)
ON CONFLICT(day_utc) DO UPDATE SET
  total_requests = total_requests + 1,
  get_requests = get_requests + excluded.get_requests,
  put_requests = put_requests + excluded.put_requests,
  head_requests = head_requests + excluded.head_requests,
  native_auth_requests = native_auth_requests + excluded.native_auth_requests,
  updated_at = excluded.updated_at
WHERE b2_account_daily_request_quota.total_requests < ?
  AND b2_account_daily_request_quota.get_requests + excluded.get_requests <= ?
  AND b2_account_daily_request_quota.put_requests + excluded.put_requests <= ?
  AND b2_account_daily_request_quota.head_requests + excluded.head_requests <= ?
  AND b2_account_daily_request_quota.native_auth_requests + excluded.native_auth_requests <= ?
  AND (? = 0 OR b2_account_daily_request_quota.get_requests + excluded.get_requests <= ?)
RETURNING total_requests,get_requests,put_requests,head_requests,native_auth_requests
`;

function normalize(kind, workflowId) {
  if (!KINDS.includes(kind)) throw new Error("B2_QUOTA_KIND_INVALID");
  if (typeof workflowId !== "string" || !WORKFLOW.test(workflowId)) {
    throw new Error("B2_QUOTA_WORKFLOW_INVALID");
  }
  return { kind, workflowId };
}
function clock(now) {
  const iso = now instanceof Date && Number.isFinite(now.getTime())
    ? now.toISOString() : "";
  if (!iso) throw new Error("B2_QUOTA_CLOCK_INVALID");
  return { day: iso.slice(0, 10), iso };
}
function counts(row) {
  const values = [row?.total_requests,row?.get_requests,row?.put_requests,
    row?.head_requests,row?.native_auth_requests];
  if (values.some(v => !Number.isSafeInteger(Number(v)) || Number(v)<0)) {
    throw new Error("B2_QUOTA_RECEIPT_INVALID");
  }
  return {
    total: Number(values[0]), GET: Number(values[1]), PUT: Number(values[2]),
    HEAD: Number(values[3]), NATIVE_AUTH: Number(values[4]),
  };
}

export async function reserveB2AccountQuota(db, body, {now = new Date()} = {}) {
  const { kind, workflowId } = normalize(body?.kind, body?.workflow_id);
  const { day, iso } = clock(now);
  if (!db?.prepare) throw new Error("B2_QUOTA_D1_UNAVAILABLE");
  const increments = KINDS.map(k => Number(k === kind));
  // This is evaluated within the SAME atomic quota UPSERT, not as a racy
  // SELECT or user-provided priority. Recovery workers never inherit this
  // low-priority app ceiling; the account's 45-GET hard safety cap persists.
  const getCeiling = kind !== "GET" ? null
    : workflowId === "app_private_structural_serving"
      ? B2_APP_STRUCTURAL_SHARED_GET_CEILING
      : APP_PRIVATE_METADATA_WORKFLOWS.has(workflowId)
        ? B2_APP_PRIVATE_METADATA_SHARED_GET_CEILING
        : PUBLIC_B2_READ_WORKFLOWS.has(workflowId)
          ? B2_PUBLIC_EDGE_GLOBAL_GET_CEILING : null;
  const row = await db.prepare(ATOMIC_B2_QUOTA_SQL).bind(
    day, ...increments, iso,
    B2_DAILY_LIMITS.total,B2_DAILY_LIMITS.GET,B2_DAILY_LIMITS.PUT,
    B2_DAILY_LIMITS.HEAD,B2_DAILY_LIMITS.NATIVE_AUTH,
    getCeiling === null ? 0 : 1,
    getCeiling ?? B2_DAILY_LIMITS.GET,
  ).first();
  // If the UPSERT's WHERE failed, *no B2 operation* is authorized.
  if (!row) return {
    ok: false, error: "B2_GLOBAL_DAILY_QUOTA_EXHAUSTED",
    day_utc: day, reserved: false, limits: B2_DAILY_LIMITS,
  };
  const used = counts(row);
  if (used.total > B2_DAILY_LIMITS.total ||
      KINDS.some(k => used[k] > B2_DAILY_LIMITS[k])) {
    throw new Error("B2_QUOTA_RECEIPT_INVALID");
  }
  // Per-workflow write is diagnostic. On D1 failure the account ticket remains
  // consumed conservatively and the caller gets no authorization to call B2.
  await db.prepare(`
    INSERT INTO b2_request_quota_workflow_receipt
       (day_utc,workflow_id,operation,requests,updated_at)
    VALUES (?,?,?,1,?)
    ON CONFLICT(day_utc,workflow_id,operation) DO UPDATE SET
       requests=requests+1,updated_at=excluded.updated_at
  `).bind(day, workflowId, kind, iso).run();
  return {
    ok: true, schema: "geomacro.b2-account-request-reservation.v1",
    reserved: true, day_utc: day, kind,
    used, limits: B2_DAILY_LIMITS,
    // No caller is permitted to infer B2 source freshness or rights.
    b2_operation_performed: false, public_published: false, chargeable: false,
  };
}

export async function readB2AccountQuota(db, {now = new Date()} = {}) {
  const { day } = clock(now);
  if (!db?.prepare) throw new Error("B2_QUOTA_D1_UNAVAILABLE");
  const row = await db.prepare(`
    SELECT total_requests,get_requests,put_requests,head_requests,native_auth_requests
    FROM b2_account_daily_request_quota WHERE day_utc=? LIMIT 1
  `).bind(day).first();
  return { ok: true, schema: "geomacro.b2-account-quota-status.v1",
    day_utc: day, used: row ? counts(row) : {
      total:0,GET:0,PUT:0,HEAD:0,NATIVE_AUTH:0,
    }, limits: B2_DAILY_LIMITS,
    account_wide_reporting_requires_all_clients_governed: true,
  };
}
