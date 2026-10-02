import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(process.cwd(), "src/components/sections/onchain-section.tsx"), "utf8");

describe("onchain mainnet boundary", () => {
  it("keeps the live technical-proof surface explicitly mainnet-disabled", () => {
    expect(source).toContain("Mainnet remains disabled");
    expect(source).toContain("Arc mainnet: coming soon.");
    expect(source).toContain("Geomacro keeps mainnet transaction features disabled until full production completion and acceptance.");
  });
});
