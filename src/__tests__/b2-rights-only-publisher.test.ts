import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

const publisher=readFileSync("scripts/ops/publish-b2-live-snapshots.ts","utf8");
const workflow=readFileSync(".github/workflows/b2-live-snapshot-maintenance.yml","utf8");
const wrapper=readFileSync("scripts/ops/run-b2-snapshot-maintenance-with-preservation.mjs","utf8");

describe("isolated commercial source-rights snapshot recovery",()=>{
  it("reads and validates ALL source rights and certifications before any rights-only upload",()=>{
    const block=publisher.slice(publisher.indexOf("async function collectCommercialSourceRights()"),
      publisher.indexOf('if (mode === "rights-only")'));
    expect(block).toContain('.from("live_external_sources")');
    expect(block).toContain('.from("live_source_certification_records")');
    expect(block).toContain("SOURCE_RIGHTS_MAX_ROWS");
    expect(block).toContain("sourceIds.has(sourceId)");
    expect(block).toContain("evaluatePaidOutputSourceReadiness");
    const rights=publisher.slice(publisher.indexOf('if (mode === "rights-only")'),
      publisher.indexOf("const intelligenceRows = await readPublicIntelligenceRowsFromSupabase();"));
    expect(rights).toContain("await collectCommercialSourceRights()");
    expect(rights).toContain('"geomacro.commercial-source-rights-live.v2"');
    expect(rights).toContain("sourceRightsSnapshot.length");
    expect(rights).toContain("b2.putWithMetadataVerification");
    expect(rights).toContain("verifyRestored:");
    expect(rights).toContain("gunzipSync(bytes)");
    expect(rights).toContain("full_body_readback_verified");
    expect(rights).not.toContain("readPublicIntelligenceRowsFromSupabase");
    expect(rights).not.toContain("readPublicGlobalRisk");
    expect(rights).not.toContain("b2.put(SOURCE_RIGHTS_KEY");
  });

  it("keeps full legacy publisher gated while manual rights-only does not fake full category readiness",()=>{
    expect(publisher).toContain('const mode = process.argv[2] ?? "live-public"');
    expect(publisher).toContain('if (!paidOutputReadiness.ready)');
    expect(publisher).toContain("B2_LIVE_PAID_OUTPUT_SOURCE_SET_NOT_READY");
    expect(publisher).toContain('mode: "rights-only"');
    expect(publisher).toContain('supabase_writes: 0');
    expect(publisher).toContain('x402_settlements: 0');
  });

  it("uses a production-only main dispatch with B2 shared D1 quota reservation (not automatic publisher spend)",()=>{
    expect(workflow).toContain("type: choice");
    expect(workflow).toContain("options: [rights-only, live-public]");
    expect(workflow).toContain('inputs.mode == \'rights-only\'');
    expect(workflow).toContain('inputs.mode == \'live-public\'');
    expect(workflow).toContain('github.ref == \'refs/heads/main\'');
    expect(workflow).toContain('B2_ACCOUNT_QUOTA_REQUIRED: "1"');
    expect(workflow).toContain('B2_ACCOUNT_QUOTA_WORKFLOW_ID: rights_only_refresh');
    expect(workflow).toContain('B2_REQUEST_BUDGET: "6"');
    expect(workflow).toContain("D1_DATABASE_ID=$id");
    expect(workflow).toContain("run: bun scripts/ops/publish-b2-live-snapshots.ts rights-only");
    expect(workflow).not.toContain("schedule:");
    // No manual dispatch can reactivate frozen Supabase-backed public hot
    // snapshots. The independently governed source-rights reader is separate.
    const legacyJob=workflow.slice(workflow.indexOf("  publish:\n"),
      workflow.indexOf("  rights-only:\n"));
    expect(legacyJob).toContain("inputs.mode == 'live-public' && false");
    expect(legacyJob).toContain('B2_ACCOUNT_QUOTA_REQUIRED: "1"');
    expect(legacyJob).toContain("B2_ACCOUNT_QUOTA_WORKFLOW_ID: legacy_public_snapshot_retired");
    expect(legacyJob).not.toContain("D1_DATABASE_ID=");

  });

  it("routes rights-only inventory reads through existing project-locked SELECT-only Postgres client",()=>{
    expect(publisher).toContain('import { createDirectPostgresClient } from "./direct-postgres-supabase-lite"');
    expect(publisher).toContain('mode === "rights-only"');
    expect(publisher).toContain('createDirectPostgresClient(String(process.env.SUPABASE_DB_URL ?? ""))');
    expect(publisher).toContain('directRightsDb.from("live_external_sources")');
    expect(publisher).toContain('directRightsDb.from("live_source_certification_records")');
    expect(publisher).toContain('mode === "live-public"');
    expect(publisher).toContain('supabase!.from("live_external_sources")');
    expect(publisher).toContain('supabase!.from("live_source_certification_records")');
    expect(workflow).toContain('SUPABASE_DB_URL: ${{ secrets.SUPABASE_DB_URL }}');
    const rightsJob=workflow.slice(workflow.indexOf("  rights-only:\n"));
    expect(rightsJob).toContain('command -v psql');
    expect(rightsJob).not.toContain('APP_SUPABASE_SERVICE_ROLE_KEY');
    expect(rightsJob).not.toContain('APP_SUPABASE_URL');
    expect(rightsJob).toContain('B2_ACCOUNT_QUOTA_REQUIRED: "1"');
    expect(rightsJob).toContain('B2_ACCOUNT_QUOTA_WORKFLOW_ID: rights_only_refresh');
    expect(rightsJob).toContain('B2_REQUEST_BUDGET: "6"');
    // The already guarded full public publisher deliberately retains
    // its own REST/source-network path and does not silently change.
    expect(workflow.slice(0,workflow.indexOf("  rights-only:\n")))
      .toContain('APP_SUPABASE_SERVICE_ROLE_KEY');
  });

  it("preserved B2 snapshot readback checks current v2 rights schema, not abandoned v1",()=>{
    expect(wrapper).toContain('"geomacro.commercial-source-rights-live.v2"');
    expect(wrapper).not.toContain('"geomacro.commercial-source-rights-live.v1"');
  });
});
