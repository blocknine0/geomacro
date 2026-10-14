import {readFileSync} from "node:fs";
import {describe,it,expect} from "vitest";
describe("canonical read-only production deployment proof",()=>{
  it("compares the live build against the current protected main PR base, not an obsolete Phase 1 commit",()=>{
    const workflow=readFileSync(".github/workflows/live-on-demand-source-acceptance.yml","utf8");
    const probe=readFileSync("scripts/ops/phase2-production-no-funds-readback.mjs","utf8");
    expect(workflow).toContain("GEOMACRO_EXPECTED_DEPLOYED_SHA: ${{ github.event.pull_request.base.sha }}");
    expect(workflow).not.toContain("295c483d45536a57fbea255f6a98dae68834d5d8");
    expect(probe).toContain("PRODUCTION_EXACT_SHA_NOT_CONFIRMED");
    expect(probe).toContain("if(report.exact_sha_verified)");
    expect(probe).toContain("payment_attempts:0,settlement_attempts:0");
    expect(workflow).toContain("github.event_name == 'pull_request'");
    expect(workflow).toContain("No raw response body");
  });
});
