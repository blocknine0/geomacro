import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("cap-independent verified edge continuity", () => {
  it("requires successful main-run B2 readback proof before materializing continuity", () => {
    const prepare = read("scripts/ops/prepare-edge-continuity.sh");
    const materialize = read("scripts/ops/materialize-edge-continuity.mjs");
    expect(prepare).toContain("branch=main&status=success&per_page=50");
    expect(prepare).toContain('proof.b2_readback_verified !== true');
    expect(prepare).toContain('proof.destructive_change !== false');
    expect(materialize).toContain('proof?.b2_readback_verified !== true');
    expect(materialize).toContain('proof?.destructive_change !== false');
    expect(materialize).toContain('"geomacro.edge-continuity.v1"');
    expect(materialize).toContain("payload_sha256");
    expect(materialize).toContain("source_live_sha256");
    expect(prepare).toContain("artifact_name_for_run()");
    expect(prepare).toContain("gri-realtime-direct-postgres-%s");
    expect(prepare).toContain("risk-indices-realtime-%s");
    expect(prepare).toContain("intelligence-current-%s");
    expect(prepare).toContain("try_candidate()");
    expect(prepare).toContain("No coherent B2-readback-verified continuity source found");
    expect(prepare).toContain("SELECTED_RUN_ID");
    expect(prepare).toContain('.sort((a, b) => Date.parse(String(a?.created_at ?? "")) - Date.parse(String(b?.created_at ?? "")))');
    expect(prepare).toContain('repos/$REPO/actions/artifacts/$ARTIFACT_ID/zip');
    expect(materialize).toContain('findFile("global-risk-published-live.json")');
    expect(materialize).toContain('findFile("global-risk-three-index.json")');
    expect(materialize).toContain('findFile("risk-indices-published-live.json")');
    expect(materialize).not.toContain('findFile("risk-indices-edge.json")');
  });

  it("keeps full payloads out of D1 and uses bounded edge modules only", () => {
    const control = read("workers/control-plane/src/index.mjs");
    expect(control).toContain("DURABLE_PAYLOAD_BELONGS_IN_B2");
    for (const base of ["global-risk-edge", "risk-indices-edge", "intelligence-edge"]) {
      const worker = read(`workers/${base}/src/index.mjs`);
      const continuity = read(`workers/${base}/src/continuity.mjs`);
      expect(worker).toContain('import continuity from "./continuity.mjs"');
      expect(worker).toContain("payload_sha256");
      expect(worker).toContain("source_live_sha256");
      expect(worker).toContain("!/^\\d+$/.test");
      expect(worker).not.toContain("!/^\\\\d+$/.test");
      expect(continuity).toBe("export default null;\n");
    }
  });

  it("refreshes continuity at bounded six-hour cadence without a deploy-time B2 publisher", () => {
    const global = read(".github/workflows/deploy-global-risk-edge.yml");
    const indices = read(".github/workflows/deploy-risk-indices-edge.yml");
    const intelligence = read(".github/workflows/deploy-intelligence-edge.yml");
    expect(global).toContain('cron: "13 */6 * * *"');
    expect(indices).toContain('cron: "28 */6 * * *"');
    expect(intelligence).toContain('cron: "43 */6 * * *"');
    for (const workflow of [global, indices, intelligence]) {
      expect(workflow).toContain("prepare-edge-continuity.sh");
      expect(workflow).toContain("B2_ARCHIVE_READ_KEY_ID");
      expect(workflow).toContain("B2_ARCHIVE_READ_APPLICATION_KEY");
    }
    expect(indices).not.toContain("Bootstrap isolated verified Risk Indices package");
    expect(indices).not.toContain("publish-b2-risk-indices-direct-postgres.mjs | tee");
  });
});
