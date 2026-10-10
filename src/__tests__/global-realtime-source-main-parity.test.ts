import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("#1827 merged-main original publisher proof parity", () => {
  const workflow=readFileSync(".github/workflows/global-realtime-source-proof.yml","utf8");
  const prBlock=workflow.split("  pull_request:")[1]?.split("\n  push:")[0]??"";
  const pushBlock=workflow.split("  push:")[1]?.split("\n  workflow_dispatch:")[0]??"";

  it("runs a post-merge source proof for every current original-source parser", () => {
    expect(pushBlock).toContain("branches: [main]");
    for(const path of [
      "scripts/ops/probe-official-native-rss-three-domains.mjs",
      "scripts/lib/quota-safe-original-discovery-fallback.mjs",
      "scripts/lib/official-native-rss.mjs",
      "scripts/lib/official-native-alternates.mjs",
      "src/__tests__/official-native-rss-three-domains.test.ts",
      "src/__tests__/official-native-alternates.test.ts",
    ]){
      expect(prBlock).toContain(path);
      expect(pushBlock).toContain(path);
    }
  });

  it("does not launch the private-write 90-minute or payment acceptance job on push", () => {
    expect(workflow).toContain("exact-head-production-realtime-acceptance:");
    expect(workflow).toContain("if: github.event_name == 'pull_request'");
    expect(pushBlock).not.toContain("schedule:");
    expect(pushBlock).not.toContain("workflow_run:");
    expect(workflow).toContain("if [[ \"\u0024{{ github.event_name }}\" != \"pull_request\" ]]");
    expect(workflow).toContain("exit \"\u0024rc\"");
    // Source transport/network outages remain production RED, not merged-green.
    expect(workflow).toContain("SOURCE_POLL_DEGRADED");
  });
});
