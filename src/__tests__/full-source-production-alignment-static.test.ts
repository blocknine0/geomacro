import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const script = readFileSync("scripts/ops/full-source-production-alignment.mjs", "utf8");
const workflow = readFileSync(".github/workflows/full-source-production-alignment.yml", "utf8");

describe("full source production alignment", () => {
  it("uses the authoritative direct Postgres control path instead of Supabase REST", () => {
    expect(script).toContain('const DB_URL = String(process.env.SUPABASE_DB_URL');
    expect(script).toContain('execFileAsync(\n  "psql"');
    expect(script).not.toContain("@supabase/supabase-js");
    expect(script).not.toContain("createClient(");
    expect(script).not.toContain("/rest/v1/");
  });

  it("derives the alignment universe from required plus active sources", () => {
    expect(script).toContain("from public.live_global_source_universe u where u.required=true");
    expect(script).toContain("where s.enabled_for_ingestion=true or s.enabled_for_commercial_signals=true");
    expect(script).not.toMatch(/required_source_count\s*=\s*(?:933|949)/);
  });

  it("never bulk-certifies unresolved sources", () => {
    expect(script).toContain("when c.certification_state='CERTIFIED' then 'CERTIFIED' else 'IN_REVIEW'");
    expect(script).toContain("Production-aligned fail-closed review");
    expect(script).not.toContain("certification_state='CERTIFIED'\n");
    expect(script).not.toContain("promote_source_certification_evidence_graph_run");
  });

  it("converts ambiguous certification dimensions to explicit fail-closed outcomes", () => {
    expect(script).toContain("when c.endpoint_status='UNTESTED' then 'FAIL'");
    expect(script).toContain("when c.schema_status='UNTESTED' then 'FAIL'");
    expect(script).toContain("when c.freshness_status='UNTESTED' then 'FAIL'");
    expect(script).toContain("when c.provenance_status='UNTESTED' then 'FAIL'");
    expect(script).toContain("when c.independence_status='UNTESTED' then 'FAIL'");
    expect(script).toContain("when c.runtime_status='UNTESTED' then 'FAIL'");
    expect(script).toContain("when c.fallback_status='UNTESTED' then 'FAIL'");
    expect(script).toContain("when c.endpoint_disposition is null or c.endpoint_disposition='UNCLASSIFIED' then 'FAIL'");
  });

  it("uses the reviewed rights manifest but does not treat registry COMMERCIAL_OK as proof", () => {
    expect(script).toContain("COMMERCIAL_SOURCE_RIGHTS_EVIDENCE");
    expect(script).toContain('evidence?.approved_status === "VERIFIED"');
    expect(script).toContain("when rr.source_id is not null then 'COMMERCIAL_OK'");
    expect(script).toContain("else 'REVIEW_REQUIRED'");
  });

  it("keeps every non-certified queue path fail closed and removes pending checks", () => {
    expect(script).toContain("certification_state='QUEUED'");
    expect(script).toContain("fail_closed=true");
    expect(script).toContain("endpoint_check=c.endpoint_status");
    expect(script).toContain("rights_check=c.rights_status");
    expect(script).toContain("schema_check=c.schema_status");
    expect(script).toContain("freshness_check=c.freshness_status");
    expect(script).toContain("independence_check=c.independence_status");
    expect(script).toContain("queue_pending");
    expect(script).toContain("fail_open_noncert");
  });

  it("runs only on canonical main/schedule/manual production paths and pins actions", () => {
    expect(workflow).toContain("branches:\n      - main");
    expect(workflow).toContain('cron: "17 3 * * *"');
    expect(workflow).toContain("workflow_dispatch: {}");
    expect(workflow).toContain("environment: production");
    expect(workflow).toContain("EXPECTED_SUPABASE_PROJECT_REF: ldpwajisioljyjtojvfx");
    expect(workflow).toContain("SUPABASE_DB_URL: ${{ secrets.SUPABASE_DB_URL }}");
    expect(workflow).toContain("uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1");
    expect(workflow).toContain("uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020");
    expect(workflow).toContain("uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a");
  });

  it("does not enable payment, settlement or mainnet", () => {
    expect(script).toContain("no_payment_or_mainnet_activation: true");
    expect(script).not.toMatch(/(?:payment|settlement|mainnet).*(?:enable|activate)/i);
  });
});
