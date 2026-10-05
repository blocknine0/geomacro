import { describe, expect, it } from "vitest";
import {
  findRemainingDenoReferences,
  rewriteDenoEnvGets,
} from "../../scripts/lib/deno-env-rewrite.mjs";

describe("local canonical structurer Deno env rewrite", () => {
  it("rewrites inline Deno.env.get reads", () => {
    expect(rewriteDenoEnvGets('const token = Deno.env.get("LIVE_STRUCTURE_TOKEN");'))
      .toBe("const token = process.env.LIVE_STRUCTURE_TOKEN;");
  });

  it("rewrites formatter-style multiline reads with a trailing comma", () => {
    const source = `const expected =\n  Deno.env.get(\n    "LIVE_STRUCTURE_TOKEN",\n  );`;
    expect(rewriteDenoEnvGets(source))
      .toBe("const expected =\n  process.env.LIVE_STRUCTURE_TOKEN;");
  });

  it("accepts single-quoted static environment names", () => {
    expect(rewriteDenoEnvGets("const value = Deno.env.get('B2_ARCHIVE_READ_KEY_ID');"))
      .toBe("const value = process.env.B2_ARCHIVE_READ_KEY_ID;");
  });

  it("leaves dynamic Deno reads visible to the fail-closed residual gate", () => {
    const source = "const value = Deno.env.get(dynamicName);";
    const rewritten = rewriteDenoEnvGets(source);
    expect(rewritten).toBe(source);
    expect(findRemainingDenoReferences(rewritten)).toEqual(["Deno.env"]);
  });
});
