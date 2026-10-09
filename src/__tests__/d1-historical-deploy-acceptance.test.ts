import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const deploy=readFileSync(".github/workflows/deploy-control-plane-d1.yml","utf8");
const worker=readFileSync("workers/control-plane/src/index.mjs","utf8");

describe("#1827 live Cloudflare D1 historical endpoint acceptance",()=>{
  it("bounds edge propagation check and never interprets old HTTP 401 as verified history",()=>{
    expect(deploy).toContain("for attempt in 1 2 3 4 5 6 7 8 9 10; do");
    expect(deploy).toContain('if [ "$code" = "200" ] || [ "$code" = "503" ]; then');
    expect(deploy).toContain('if [ "$code" != "401" ] && [ "$code" != "404" ]; then');
    expect(deploy).toContain('if [ "$attempt" = "10" ]; then');
    expect(deploy).toContain("sleep 4");
    expect(deploy).toContain("Historical endpoint not propagated after bounded retries");
    expect(deploy).not.toContain('if [ "$code" = "401" ]; then\n            exit 0');
  });

  it("preserves mandatory 200 proof or 503 absent-archive response, never accepts stale as current",()=>{
    expect(deploy).toContain('"/v1/public/historical-continuity/global-risk"'.replaceAll('"',""));
    expect(deploy).toContain(".historical_only == true");
    expect(deploy).toContain(".current_snapshot_available == false");
    expect(deploy).toContain(".commercial_eligible == false");
    expect(deploy).toContain(".x402_chargeable == false");
    expect(deploy).toContain(".independently_rechecked_b2_now == false");
    expect(deploy).toContain('if [ "$code" = "200" ]; then');
    expect(deploy).toContain('elif [ "$code" = "503" ]; then');
    expect(deploy).toContain('GLOBAL_RISK_VERIFIED_ARCHIVE_UNAVAILABLE');
    expect(deploy).toContain('(has("score") | not)');
    expect(deploy).toContain('(has("payload_json") | not)');
  });

  it("main deploy is automatic but historical path cannot call authenticated B2/GRO/payment writer",()=>{
    expect(deploy).toContain('      - "workers/control-plane/**"');
    expect(deploy).toContain("Deploy D1 control-plane Worker with pinned Wrangler");
    expect(worker).toContain('url.pathname === "/v1/public/historical-continuity/global-risk"');
    expect(worker.indexOf('url.pathname === "/v1/public/historical-continuity/global-risk"'))
      .toBeLessThan(worker.indexOf("const auth = authorized(request, env)"));
    expect(worker).toContain("return getPublicHotSnapshot(env, decodeURIComponent(parts[3]));");
  });
});
