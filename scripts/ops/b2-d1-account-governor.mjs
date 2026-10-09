// Production opt-in D1 account quota adapter for the canonical B2 Node client.
// All producer workflows must be migrated before calling this a global guard.
// It uses the SAME D1 SQL reservation helper as the authenticated Worker route.
import { reserveB2AccountQuota } from "../../workers/control-plane/src/b2-account-quota.mjs";

const WORKFLOW_ID = /^[a-z][a-z0-9_-]{1,47}$/u;
const IDENTIFIER = /^[a-z0-9-]{16,64}$/iu;
const API_ROOT = "https://api.cloudflare.com/client/v4";

function config(env) {
  const account = String(env.CLOUDFLARE_ACCOUNT_ID ?? "").trim();
  const database = String(env.D1_DATABASE_ID ?? "").trim();
  const token = String(env.CLOUDFLARE_API_TOKEN ?? "").trim();
  const workflow = String(env.B2_ACCOUNT_QUOTA_WORKFLOW_ID ?? "").trim();
  if (!IDENTIFIER.test(account) || !IDENTIFIER.test(database) ||
      token.length < 20 || !WORKFLOW_ID.test(workflow)) {
    throw new Error("B2_ACCOUNT_GLOBAL_QUOTA_CONFIGURATION_REQUIRED");
  }
  return { account, database, token, workflow };
}

export function createB2D1AccountGovernor({
  env = process.env, fetchImpl = fetch, now = () => new Date(),
} = {}) {
  const {account,database,token,workflow} = config(env);
  const endpoint = API_ROOT + "/accounts/" + encodeURIComponent(account) +
    "/d1/database/" + encodeURIComponent(database) + "/query";
  const doQuery = async (sql, params) => {
    let response;
    try {
      response = await fetchImpl(endpoint, {
        method: "POST",
        headers: { authorization: "Bearer " + token, "content-type": "application/json" },
        body: JSON.stringify({sql,params}),
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new Error("B2_ACCOUNT_GLOBAL_QUOTA_D1_NETWORK_FAILED");
    }
    let payload;
    try { payload = await response.json(); }
    catch { throw new Error("B2_ACCOUNT_GLOBAL_QUOTA_D1_RESPONSE_INVALID"); }
    if (!response.ok || payload?.success !== true ||
        !Array.isArray(payload.result) || payload.result.length !== 1 ||
        payload.result[0]?.success === false ||
        !Array.isArray(payload.result[0]?.results)) {
      // Never surface account details, HTTP body, token or provider diagnostics.
      throw new Error("B2_ACCOUNT_GLOBAL_QUOTA_D1_RESERVATION_FAILED");
    }
    return payload.result[0].results;
  };
  const db = {
    prepare(sql) {
      return {
        bind(...params) {
          return {
            async first() { return (await doQuery(sql, params))[0] ?? null; },
            async run() { await doQuery(sql, params); return {success:true}; },
          };
        },
      };
    },
  };
  return {
    async reserve(kind) {
      if (!["GET","PUT","HEAD","NATIVE_AUTH"].includes(kind)) {
        throw new Error("B2_ACCOUNT_GLOBAL_QUOTA_KIND_INVALID");
      }
      const receipt = await reserveB2AccountQuota(db, {
        kind, workflow_id: workflow,
      }, { now: now() });
      if (!receipt.ok || !receipt.reserved) throw new Error("B2_GLOBAL_DAILY_QUOTA_EXHAUSTED");
      return {day_utc:receipt.day_utc,kind:receipt.kind,used:receipt.used,limits:receipt.limits};
    },
  };
}
