import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const publishedReplay = readFileSync("scripts/replay-published-gri-v11.js", "utf8");

describe("security error disclosure", () => {
  it("does not emit stack traces from the published GRI replay command", () => {
    expect(publishedReplay).not.toContain("error.stack");
    expect(publishedReplay).toContain("Published GRI replay failed:");
  });
});
