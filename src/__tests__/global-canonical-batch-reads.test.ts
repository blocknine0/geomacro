import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("canonical refresh read budget", () => {
  it("enables batch reuse independently of the optional report output path", () => {
    const runner = read("scripts/refresh-global-canonical-risk-objects.ts");
    const publisher = read("src/lib/country-risk-publisher.server.ts");
    const macro = read("src/lib/country-risk-v02-normalization.server.ts");

    expect(runner).toContain('process.env.GEOMACRO_CANONICAL_BATCH = "1"');
    expect(publisher).toContain('process.env.GEOMACRO_CANONICAL_BATCH !== "1"');
    expect(publisher).not.toContain('if (!process.env.GLOBAL_CANONICAL_REFRESH_OUTPUT)');
    expect(macro).toContain('process.env.GEOMACRO_CANONICAL_BATCH !== "1"');
    expect(macro).toContain("batchNormalizations.set(key, promise)");
    expect(macro).toContain("batchNormalizations.delete(key)");
  });
});
