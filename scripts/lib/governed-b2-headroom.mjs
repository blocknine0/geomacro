// Account-quota admission for a two-source, fragment-based offline producer.
// Status is READ-ONLY and advisory. Every actual GET/PUT still needs an
// independently atomic D1 reservation just before the Backblaze HTTP call.
import { B2_DAILY_LIMITS } from "../../workers/control-plane/src/b2-account-quota.mjs";

export const GOVERNED_B2_HEADROOM_SCHEMA =
  "geomacro.governed-ingestion-b2-headroom.v1";

const KINDS = ["GET", "PUT", "HEAD", "NATIVE_AUTH"];
function positiveInteger(v) {
  return Number.isSafeInteger(v) && v >= 0;
}
export function evaluateGovernedB2Headroom(status, {
  getRequests = 2, putRequests = 2, now = new Date(),
} = {}) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime()) ||
      !positiveInteger(getRequests) || !positiveInteger(putRequests) ||
      getRequests < 2 || putRequests < 2 ||
      getRequests !== putRequests || getRequests + putRequests > 20) {
    throw new Error("GOVERNED_B2_HEADROOM_REQUEST_PLAN_INVALID");
  }
  const today = now.toISOString().slice(0, 10);
  if (status?.ok !== true ||
      status?.schema !== "geomacro.b2-account-quota-status.v1" ||
      status?.day_utc !== today ||
      status?.account_wide_reporting_requires_all_clients_governed !== true) {
    throw new Error("GOVERNED_B2_HEADROOM_D1_STATUS_UNVERIFIED");
  }
  const used = status.used;
  const limits = status.limits;
  if (!used || !limits ||
      !positiveInteger(used.total) ||
      limits.total !== B2_DAILY_LIMITS.total ||
      KINDS.some(k => !positiveInteger(used[k]) ||
        limits[k] !== B2_DAILY_LIMITS[k] || used[k] > limits[k]) ||
      used.total > limits.total ||
      KINDS.reduce((n,k)=>n+used[k],0) !== used.total) {
    throw new Error("GOVERNED_B2_HEADROOM_COUNTS_INVALID");
  }
  const required = {total:getRequests+putRequests,GET:getRequests,PUT:putRequests};
  const canRun = used.total+required.total<=limits.total &&
    used.GET+required.GET<=limits.GET &&
    used.PUT+required.PUT<=limits.PUT;
  return {
    schema:GOVERNED_B2_HEADROOM_SCHEMA,
    day_utc:today,
    admitted:canRun,
    reason:canRun?"HEADROOM_AVAILABLE":"SHARED_B2_DAILY_BUDGET_HELD",
    checked_before_b2_network:true,
    guarantee_against_concurrent_reservations:false,
    still_requires_atomic_per_request_d1_tickets:true,
    public_published:false,
    commercial_eligible:false,
    source_freshness_not_asserted:true,
    supabase_writes:0,
    b2_requests_by_this_check:0,
    usdc_spent:0,
  };
}
