// Fail-closed read-only preflight for the manual legacy GDELT GAL B2 producer.
// The live source is upstream Google Cloud Storage, not Backblaze; only our
// compact archived fragment PUT + independent GET consumes the B2 allowance.
// Never grant an ungoverned B2 call even when a manual workflow is dispatched.
import { createB2D1AccountGovernor } from "../ops/b2-d1-account-governor.mjs";
import { B2_DAILY_LIMITS } from "../../workers/control-plane/src/b2-account-quota.mjs";

const EXPECTED_WORKFLOW = "gdelt_gal_recovery";
const KINDS = ["GET", "PUT", "HEAD", "NATIVE_AUTH"];
const VALID_COUNTER = (value) => Number.isSafeInteger(value) && value >= 0;

export async function requireGdeltB2RecoveryHeadroom({
  env = process.env,
  now = new Date(),
  governor = null,
} = {}) {
  if (env.B2_GDELT_PRIMARY !== "1" ||
      env.B2_ACCOUNT_QUOTA_REQUIRED !== "1" ||
      env.B2_ACCOUNT_QUOTA_WORKFLOW_ID !== EXPECTED_WORKFLOW ||
      !String(env.D1_DATABASE_ID ?? "").trim() ||
      !String(env.CLOUDFLARE_API_TOKEN ?? "").trim() ||
      !String(env.CLOUDFLARE_ACCOUNT_ID ?? "").trim() ||
      !VALID_COUNTER(Number(env.B2_REQUEST_BUDGET)) ||
      Number(env.B2_REQUEST_BUDGET) < 2 ||
      Number(env.B2_REQUEST_BUDGET) > 6) {
    throw new Error("GDELT_B2_ACCOUNT_QUOTA_GUARD_REQUIRED");
  }
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new Error("GDELT_B2_QUOTA_CLOCK_INVALID");
  }
  const status = await (governor ?? createB2D1AccountGovernor({env})).status();
  const used = status?.used;
  const limits = status?.limits;
  if (status?.ok !== true ||
      status?.schema !== "geomacro.b2-account-quota-status.v1" ||
      status?.day_utc !== now.toISOString().slice(0, 10) ||
      status?.account_wide_reporting_requires_all_clients_governed !== true ||
      !VALID_COUNTER(used?.total) ||
      !limits || limits.total !== B2_DAILY_LIMITS.total ||
      KINDS.some(kind => !VALID_COUNTER(used?.[kind]) ||
        limits[kind] !== B2_DAILY_LIMITS[kind] ||
        used[kind] > limits[kind]) ||
      KINDS.reduce((sum, kind) => sum + used[kind], 0) !== used.total ||
      used.total > limits.total) {
    throw new Error("GDELT_B2_SHARED_D1_QUOTA_STATUS_INVALID");
  }
  // One immutable fragment PUT + one independent full-body verification GET.
  // This is advisory admission only. Each HTTP attempt MUST still reserve
  // an atomic shared D1 quota ticket through createB2Client().
  if (used.total + 2 > limits.total ||
      used.PUT + 1 > limits.PUT ||
      used.GET + 1 > limits.GET) {
    throw new Error("GDELT_B2_SHARED_DAILY_QUOTA_HELD");
  }
  return {
    ok: true,
    allowed: true,
    schema: "geomacro.gdelt-b2-shared-quota-admission.v1",
    expected_b2_puts: 1,
    expected_b2_gets: 1,
    actual_b2_requests: 0,
    each_request_still_requires_atomic_d1_reservation: true,
    no_storage_cleanup: true,
    no_commercial_promotion: true,
  };
}
