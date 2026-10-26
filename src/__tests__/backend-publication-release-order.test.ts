import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {verifyBackendPublicationRevision} from "../../scripts/ops/assert-backend-publication-main.mjs";

const sha="a".repeat(40);
const valid={repository:"blocknine0/geomacro",ref:"refs/heads/main",
  eventName:"workflow_dispatch",githubSha:sha,expectedSha:sha,
  checkoutSha:sha,remoteMainSha:sha};
describe("signed-data publication precedes independent website release acceptance",()=>{
  it("admits only the current canonical code revision, without claiming signed data",()=>{
    const result=verifyBackendPublicationRevision(valid);
    expect(result.canonical_code_revision_verified).toBe(true);
    expect(result.website_deployment_checked).toBe(false);
    expect(result.reviewed_input_checked).toBe(false);
    expect(result.current_signed_publication_verified).toBe(false);
    expect(result.b2_requests+result.d1_writes+result.payments).toBe(0);
  });
  it.each([
    {repository:"attacker/geomacro"},{ref:"refs/heads/unreviewed"},
    {eventName:"pull_request"},{eventName:"push"},
    {githubSha:"main"},{expectedSha:"b".repeat(40)},
    {checkoutSha:"b".repeat(40)},{remoteMainSha:"b".repeat(40)},
    {remoteMainSha:undefined},
  ])("refuses stale or untrusted code admission: %j",change=>{
    expect(()=>verifyBackendPublicationRevision({...valid,...change})).toThrow(/BACKEND_PUBLICATION/);
  });
  it("keeps legacy signed diagnostics manual-only and free-source health as the primary release gate",()=>{
    const health=readFileSync(".github/workflows/production-website-health.yml","utf8");
    for(const value of ["workflow_dispatch:",
      "Manual-only diagnostics for the legacy signed Intelligence / GRI / Risk Indices",
      "scripts/ops/assert-website-publication-followup.mjs",
      "TRUSTED_PUBLISHER_PARENT_SHA",
      "Verify live build marker matches canonical main",
      "Verify Lovable mirror source parity",
      "/api/health?deep=1"])
      expect(health).toContain(value);
    expect(health).not.toContain("\n  push:\n");
    expect(health).not.toContain("\n  schedule:\n");
    expect(health).not.toContain("\n  workflow_run:\n");
    const freeHealth=readFileSync(".github/workflows/minimum-free-derived-production-health.yml","utf8");
    expect(freeHealth).toContain("branches: [main]");
    expect(freeHealth).toContain('cron: "23 */2 * * *"');
    expect(freeHealth).toContain("Verify exact-main permanent static archive and first HTML without funds");
    for(const name of ["gri-v12-supabase-free-reviewed-current","risk-indices-verified-d1-parent"]){
      const backend=readFileSync(".github/workflows/"+name+".yml","utf8");
      expect(backend).toContain("node scripts/ops/assert-backend-publication-main.mjs");
      expect(backend).not.toContain("geomacro-build.json");
      expect(backend.indexOf("node scripts/ops/assert-backend-publication-main.mjs"))
        .toBeLessThan(backend.indexOf(name.startsWith("gri-")?
          "      - name: Resolve shared D1 quota governor":"      - name: Resolve governed production D1 ID"));
    }
  });
});
