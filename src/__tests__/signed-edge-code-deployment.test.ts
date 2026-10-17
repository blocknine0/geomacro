import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {verifyEdgeCodeOnly,summary} from "../../scripts/ops/verify-signed-edge-code-only.mjs";

const cases=[
 ["intelligence","INTELLIGENCE_EDGE_UNAVAILABLE","geomacro.public-intelligence-live.v1"],
 ["global-risk","GLOBAL_RISK_EDGE_UNAVAILABLE","geomacro.public-global-risk-live.v1"],
 ["risk-indices","RISK_INDICES_EDGE_UNAVAILABLE","geomacro.public-risk-indices-live.v1"],
] as const;
const version="x-geomacro-worker-code-contract: source-clock-guard-v1\r\n";
describe("independent code-deployment proof cannot greenwash missing signed Intelligence/GRI/Indices",()=>{
 for(const [product,denial,schema] of cases){
  it(product+" confirms an honest new-code HTTP 503 with no fresh data",()=>{
    const verified=verifyEdgeCodeOnly({
      product,status:503,body:{ok:false,code:denial},
      headers:version+"x-geomacro-data-available: false\r\ncache-control: no-store\r\n",
    });
    expect(verified.worker_code_deployed).toBe(true);
    expect(verified.current_signed_data_accepted).toBe(false);
    expect(verified.current_data_result).toBe("NO_CURRENT_SIGNED_DATA");
    expect(verified.b2_readback_attested).toBe(false);
    expect(verified.x402_payment_authorized).toBe(false);
    expect(summary(verified)).toContain("not established by code deployment");
  });
  it(product+" refuses old-release errors, stale CDN cache and fake success",()=>{
    const deny={ok:false,code:denial};
    expect(()=>verifyEdgeCodeOnly({product,status:503,body:deny,
      headers:"cache-control: no-store\r\nx-geomacro-data-available: false\r\n"}))
      .toThrow("EDGE_CODE_DEPLOYED_RELEASE_NOT_VERIFIED");
    expect(()=>verifyEdgeCodeOnly({product,status:503,body:deny,
      headers:version+"cache-control: public, max-age=300\r\nx-geomacro-data-available: false\r\n"}))
      .toThrow("EDGE_CODE_NO_DATA_FAIL_CLOSED_INVALID");
    expect(()=>verifyEdgeCodeOnly({product,status:503,body:{ok:true,code:denial},
      headers:version+"cache-control: no-store\r\nx-geomacro-data-available: false\r\n"}))
      .toThrow("EDGE_CODE_NO_DATA_FAIL_CLOSED_INVALID");
    expect(()=>verifyEdgeCodeOnly({product,status:200,body:{schema},
      headers:version+"x-geomacro-native-clock-contract: live-60m-v1\r\n"}))
      .toThrow("EDGE_CODE_200_UNVERIFIED");
  });
  it(product+" accepts current-code 200 only as code verification, not signed-data proof",()=>{
    const verified=verifyEdgeCodeOnly({product,status:200,body:{
      schema,source_project:"ldpwajisioljyjtojvfx",
    },headers:version+"x-geomacro-native-clock-contract: live-60m-v1\r\n"});
    expect(verified.worker_code_deployed).toBe(true);
    expect(verified.current_signed_data_accepted).toBe(false);
    expect(verified.current_data_result).toBe("SEPARATE_SOURCE_PROOF_REQUIRED");
  });
  it(product+" deploy workflow checks new code before independently strict source proof",()=>{
    const path=".github/workflows/deploy-"+product+"-edge.yml";
    const workflow=readFileSync(path,"utf8");
    const versionMarker="x-geomacro-worker-code-contract";
    const worker=readFileSync("workers/"+product+"-edge/src/index.mjs","utf8");
    expect(worker).toContain(versionMarker);
    expect(worker).toContain('"x-geomacro-data-available": "false"');
    const codeStep=workflow.indexOf("scripts/ops/verify-signed-edge-code-only.mjs");
    const dataStep=workflow.indexOf("Require verified package through");
    expect(codeStep).toBeGreaterThan(-1);
    expect(dataStep).toBeGreaterThan(codeStep);
    expect(workflow).not.toContain("continue-on-error: true");
    expect(workflow).toContain("deploy --config wrangler.runtime.jsonc");
  });
 }
});
