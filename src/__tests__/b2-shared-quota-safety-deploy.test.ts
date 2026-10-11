import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("#1827 shared public B2 GET quota-only production deployment",()=>{
  const workflow=readFileSync(".github/workflows/deploy-b2-shared-quota-safety.yml","utf8");
  const governor=readFileSync("workers/control-plane/src/b2-account-quota.mjs","utf8");

  it("runs only on main or explicit dispatch with exact committed code",()=>{
    expect(workflow).toContain("branches: [main]");
    expect(workflow).toContain('ref: ${{ github.sha }}');
    expect(workflow).toContain('test "$(git rev-parse HEAD)" = "$GITHUB_SHA"');
    expect(workflow).toContain('environment: production');
    expect(workflow).toContain('cancel-in-progress: false');
    expect(workflow).not.toContain("schedule:");
  });

  it("distributes same global atomic ceiling to all three bundled Workers",()=>{
    for(const product of ["intelligence","global-risk","risk-indices"]){
      expect(workflow).toContain("product: "+product);
      expect(workflow).toContain("workers/$EDGE_PRODUCT/src/continuity.mjs");
    }
    for(const id of ["intelligence_public_edge","global_risk_public_edge","risk_indices_public_edge"])
      expect(governor).toContain('"'+id+'"');
    expect(governor).toContain("B2_PUBLIC_EDGE_GLOBAL_GET_CEILING = 10");
    expect(governor).toContain("get_requests + excluded.get_requests <= ?");
    expect(workflow).toContain("geomacro-${{ matrix.product }}-edge-production");
    expect(workflow).toContain('node "scripts/ops/$CONFIGURE_SCRIPT"');
  });

  it("requires prior B2-readback-verified continuity, schema and receipt but no B2 network or public live data to certify quota code",()=>{
    expect(workflow).toContain("prepare-edge-continuity.sh");
    expect(workflow).toContain("B2_QUOTA_HOTFIX_SHARED_D1_UNVERIFIED");
    expect(workflow).toContain("Current Version ID:");
    expect(workflow).toContain("WORKER_URL_MISMATCH");
    expect(workflow).toContain('"$EDGE_URL/not-allowed"');
    expect(workflow).toContain('"$EDGE_URL$EDGE_ROUTE"');
    expect(workflow).not.toContain("GET \"$EDGE_URL$EDGE_ROUTE\"");
    expect(workflow).not.toContain("b2_s3");
    expect(workflow).not.toContain("d1 create");
    expect(workflow).not.toContain("storage.objects");
    expect(workflow).not.toContain("supabase/functions");
    expect(workflow).not.toContain("x402/settle");
  });
});
