import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  join(process.cwd(), ".github/workflows/sync-lovable-main.yml"),
  "utf8",
);

describe("Lovable deployment mirror automation isolation", () => {
  it("removes and excludes privileged workflows and Dependabot metadata", () => {
    expect(workflow).toContain("rm -rf lovable-mirror/.github/workflows");
    expect(workflow).toContain("rm -f lovable-mirror/.github/dependabot.yml");
    expect(workflow).toContain("--exclude '.github/workflows/'");
    expect(workflow).toContain("--exclude '.github/dependabot.yml'");
  });

  it("keeps the mirror one-way from the canonical repository", () => {
    expect(workflow).toContain("if: github.repository == 'blocknine0/geomacro'");
    expect(workflow).toContain("blocknine0/geomacro-160c8e56");
    expect(workflow).toContain("git push origin HEAD:main");
  });
});
