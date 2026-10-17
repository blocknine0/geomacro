import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import {
  qualifyExactRights, verifyOneRightsReceipt, RIGHTS_KEY,
} from "./verify-wdi-b2-rights-once.mjs";

const NOW = Date.parse("2026-10-13T22:17:00.000Z");
const GENERATED = "2026-10-13T22:04:53.102Z";
const wdi = {
  source_id: "world_bank_indicators", category: "MACRO",
  certification_state: "CERTIFIED", commercial_usage_status: "DERIVED_ONLY",
  enabled_for_ingestion: true, enabled_for_commercial_signals: true,
  raw_redistribution_allowed: true, attribution_required: true,
  licence_name: "CC BY 4.0 with World Bank dataset additional terms",
};
const make = (rows = [wdi], generated_at = GENERATED) => {
  const bytes = gzipSync(Buffer.from(JSON.stringify({
    schema: "geomacro.commercial-source-rights-live.v2",
    source_project: "ldpwajisioljyjtojvfx", generated_at, rows,
  })));
  return { bytes, expectedSha: createHash("sha256").update(bytes).digest("hex") };
};
const env = {
  GITHUB_REPOSITORY: "blocknine0/geomacro", GITHUB_REF: "refs/heads/main",
  GITHUB_EVENT_NAME: "workflow_dispatch",
  GEOMACRO_OPERATOR_SINGLE_B2_RIGHTS_READ: "CONFIRMED_ONE",
  GEOMACRO_COMMERCE_LEDGER_TOKEN: "synthetic-root-not-a-production-secret-12345",
  B2_ARCHIVE_READ_KEY_ID: "synthetic-key-id",
  B2_ARCHIVE_READ_APPLICATION_KEY: "synthetic-application-key",
};
const quota = {
  ok: true, schema: "geomacro.b2-account-quota-status.v1",
  day_utc: "2026-10-13", account_wide_reporting_requires_all_clients_governed: true,
  used: { GET: 2, total: 3 }, limits: { GET: 25, total: 80 },
};
const reserved = {
  ok: true, schema: "geomacro.b2-account-request-reservation.v1",
  reserved: true, kind: "GET", day_utc: "2026-10-13",
  b2_operation_performed: false, chargeable: false,
};

test("exact gzip bytes, source project and single WDI certified row qualify", () => {
  const {bytes, expectedSha} = make();
  assert.equal(qualifyExactRights(bytes,{now:NOW,expectedSha,expectedAt:GENERATED}),
    "RIGHTS_CERTIFIED");
  const alias=make([{...wdi,category:"macro"}]);
  assert.equal(qualifyExactRights(alias.bytes,{now:NOW,
    expectedSha:alias.expectedSha,expectedAt:GENERATED}),"RIGHTS_CERTIFIED");
  assert.equal(qualifyExactRights(bytes,{now:NOW,expectedSha: "0".repeat(64),expectedAt:GENERATED}),
    "B2_RECEIPT_SHA_MISMATCH");
  assert.equal(qualifyExactRights(bytes,{now:NOW + 26 * 3600_000,expectedSha,expectedAt:GENERATED}),
    "B2_RECEIPT_STALE");
});

test("duplicate, uncertified, disabled and unexpected generation always reject", () => {
  for (const [rows, expected] of [
    [[wdi,wdi], "B2_RIGHTS_ROW_SCHEMA_INVALID"],
    [[{...wdi,certification_state:"REVIEW"}], "WDI_RIGHTS_CONTRACT_MISMATCH"],
    [[{...wdi,enabled_for_commercial_signals:false}], "WDI_RIGHTS_CONTRACT_MISMATCH"],
    [[{...wdi,licence_name:"unknown"}], "WDI_RIGHTS_CONTRACT_MISMATCH"],
    [[{...wdi,category:"GEOPOLITICS"}], "WDI_RIGHTS_CONTRACT_MISMATCH"],
    [[{...wdi,category:"Macro"}], "WDI_RIGHTS_CONTRACT_MISMATCH"],
    [[{...wdi,commercial_usage_status:"REVIEW_REQUIRED"}], "WDI_RIGHTS_CONTRACT_MISMATCH"],
    [[{...wdi,enabled_for_ingestion:false}], "WDI_RIGHTS_CONTRACT_MISMATCH"],
    [[{...wdi,attribution_required:false}], "WDI_RIGHTS_CONTRACT_MISMATCH"],
  ]) {
    const {bytes,expectedSha}=make(rows);
    assert.equal(qualifyExactRights(bytes,{now:NOW,expectedSha,expectedAt:GENERATED}),expected);
  }
  const {bytes,expectedSha}=make([wdi],"2026-10-13T21:04:53.102Z");
  assert.equal(qualifyExactRights(bytes,{now:NOW,expectedSha,expectedAt:GENERATED}),
    "B2_RECEIPT_CONTRACT_MISMATCH");
  const absent=make([{...wdi,source_id:"other_valid_source"}]);
  assert.equal(qualifyExactRights(absent.bytes,{now:NOW,
    expectedSha:absent.expectedSha,expectedAt:GENERATED}),"WDI_EXACT_SOURCE_NOT_CERTIFIED");
});

test("on exact verified source only, rejects incorrect category with fixed Boolean checks", () => {
  const {bytes,expectedSha} = make([{...wdi,category:"GEOPOLITICS"}]);
  const diagnostics = {};
  const result = qualifyExactRights(bytes,{
    now:NOW,expectedSha,expectedAt:GENERATED,diagnostics,
  });
  assert.equal(result,"WDI_RIGHTS_CONTRACT_MISMATCH");
  assert.deepEqual(diagnostics,{
    certification_state:true,commercial_usage:true,ingestion_enabled:true,
    commercial_signals_enabled:true,attribution_required:true,
    licence_cc_by_4:true,macro_category:false,
  });
  assert.ok(!JSON.stringify(diagnostics).includes("world_bank_indicators"));
  const unverified={};
  qualifyExactRights(bytes,{now:NOW,expectedSha:"0".repeat(64),
    expectedAt:GENERATED,diagnostics:unverified});
  assert.deepEqual(unverified,{});
});

test("main-only dispatch or credentials absent makes zero requests", async () => {
  let calls=0;
  const fetchImpl=async()=>{calls++;throw Error("NETWORK_FORBIDDEN");};
  const r=await verifyOneRightsReceipt({env:{...env,GITHUB_REF:"refs/heads/unsafe-pr"},
    fetchImpl,now:NOW});
  assert.equal(r.category,"OWNER_MAIN_ONLY_DISPATCH_REQUIRED");
  const r2=await verifyOneRightsReceipt({env:{...env,B2_ARCHIVE_READ_APPLICATION_KEY:""},
    fetchImpl,now:NOW});
  assert.equal(r2.category,"PRODUCTION_READ_SECRETS_UNAVAILABLE");
  assert.equal(calls,0);
});

test("expired pinned production receipt refuses all quota and B2 calls", async () => {
  let calls = 0;
  const report = await verifyOneRightsReceipt({
    env, now: NOW + 26 * 3600_000,
    fetchImpl: async () => { calls++; throw Error("SHOULD_NOT_FETCH"); },
  });
  assert.equal(report.category, "B2_RECEIPT_STALE_NO_GET_ATTEMPT");
  assert.equal(report.s3_get_attempted, false);
  assert.equal(report.fresh_d1_get_reserved, false);
  assert.equal(calls, 0);
});

test("D1 token rejection, malformed status or exhausted cap makes zero B2 reads", async () => {
  for (const [response, category] of [
    [new Response("",{status:401}),"D1_BEARER_AUTH_DENIED"],
    [Response.json({...quota,used:{GET:25,total:3}}),"D1_QUOTA_EXHAUSTED_OR_INVALID"],
    [Response.json({ok:true}),"D1_QUOTA_EXHAUSTED_OR_INVALID"],
  ]) {
    let count=0;
    const res=await verifyOneRightsReceipt({env,now:NOW,fetchImpl:async()=>{
      count++;return response;
    }});
    assert.equal(res.category,category);
    assert.equal(res.s3_get_attempted,false);
    assert.equal(count,1);
  }
});

test("D1 non-admitted reservation never authorizes a B2 request", async () => {
  const urls=[];
  const out=await verifyOneRightsReceipt({env,now:NOW,fetchImpl:async url=>{
    urls.push(String(url));
    if(urls.length===1) return Response.json(quota);
    return Response.json({...reserved,reserved:false});
  }});
  assert.equal(out.category,"D1_RESERVATION_RECEIPT_INVALID");
  assert.equal(out.s3_get_attempted,false);
  assert.equal(urls.length,2);
  assert.ok(urls.every(url => new URL(url).origin ===
    "https://geomacro-control-plane.daspallab202391.workers.dev"));
});

test("successful quota reserve can issue only one B2 GET; receipts still pinned", async () => {
  const urls=[],methods=[];
  const {bytes}=make();
  const report=await verifyOneRightsReceipt({
    env,now:NOW,fetchImpl:async (url,options)=>{
      urls.push(String(url));methods.push(options.method);
      if(urls.length===1) return Response.json(quota);
      if(urls.length===2) {
        assert.equal(options.body,JSON.stringify({kind:"GET",workflow_id:"wdi_rights_one_shot"}));
        return Response.json(reserved);
      }
      assert.ok(String(url).endsWith(RIGHTS_KEY));
      assert.ok(options.headers.Authorization.startsWith("AWS4-HMAC-SHA256 "));
      return new Response(bytes,{status:200});
    },
  });
  assert.equal(report.category,"B2_RECEIPT_SHA_MISMATCH");
  assert.equal(report.max_s3_get_attempts,1);
  assert.equal(report.s3_get_attempted,true);
  assert.equal(report.fresh_d1_get_reserved,true);
  assert.equal(report.payment_authorized,false);
  assert.equal(urls.length,3);
  assert.deepEqual(methods,["GET","POST","GET"]);
  assert.ok(!JSON.stringify(report).includes("synthetic"));
  assert.ok(!JSON.stringify(report).includes("world_bank_indicators"));
});
