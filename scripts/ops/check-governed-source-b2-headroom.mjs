#!/usr/bin/env node
// Admission before NOAA/EIA provider requests, not a replacement for the
// atomic D1 reservation on EVERY actual B2 GET/PUT. When the internal shared
// daily cap is exhausted, hold this optional measurement import explicitly.
import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createB2D1AccountGovernor } from "./b2-d1-account-governor.mjs";
import { evaluateGovernedB2Headroom } from "../lib/governed-b2-headroom.mjs";

export async function checkGovernedB2Headroom({ governor =
  createB2D1AccountGovernor(), now = new Date() } = {}) {
  const status = await governor.status();
  return evaluateGovernedB2Headroom(status, { now });
}

if(process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if(process.argv.length !== 2 ||
       process.env.B2_ACCOUNT_QUOTA_REQUIRED !== "1" ||
       process.env.B2_ACCOUNT_QUOTA_WORKFLOW_ID !== "governed_source_ingestion" ||
       !process.env.GITHUB_OUTPUT || !process.env.GITHUB_STEP_SUMMARY) {
      throw new Error("GOVERNED_B2_HEADROOM_RUNNER_CONFIG_INVALID");
    }
    const proof = await checkGovernedB2Headroom();
    appendFileSync(process.env.GITHUB_OUTPUT,
      "admitted="+String(proof.admitted)+"\n",
      {encoding:"utf8"});
    appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      proof.admitted
        ? "Governed B2 ingestion: capacity for at least 2 PUT + 2 GET exists. Actual plan is rechecked after source discovery, and every B2 attempt still requires an atomic D1 ticket.\n"
        : "Governed B2 ingestion: QUOTA-HELD (internal shared D1 request budget). NO new source API, B2, Supabase or payment request made. No fresh observation or commercial readiness is claimed. Retry after next UTC budget day or operator dispatch.\n",
      {encoding:"utf8"});
    // Safe public Actions log: no provider credentials, source data or
    // total account usage values.
    console.log(JSON.stringify(proof));
  } catch (error) {
    const code = error instanceof Error && /^GOVERNED_B2_[A-Z0-9_]+$/u.test(error.message)
      ? error.message : "GOVERNED_B2_HEADROOM_READ_FAILED_CLOSED";
    console.error(JSON.stringify({ok:false,error:code,admitted:false,
      b2_requests:0,supabase_writes:0,usdc_spent:0}));
    process.exitCode=1;
  }
}
