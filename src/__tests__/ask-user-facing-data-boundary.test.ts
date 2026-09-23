import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

function read(path: string) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

describe("Ask Geomacro public data boundary", () => {
  it("keeps the public AskAnswer contract free of raw source URLs and provider fields", () => {
    const engine = read("src/lib/ask-intelligence.server.ts");
    const workspace = read("src/components/ask/ask-workspace.tsx");

    expect(engine).toContain("evidence: Array<{ eventId: string; title: string; relevance: number }>");
    expect(engine).not.toContain("evidence: Array<{ eventId: string; title: string; sourceUrl:");
    expect(engine).not.toContain("sourceUrl: row.source_url");
    expect(engine).not.toContain("sourceUrl: sources[index].url");
    expect(engine).not.toContain("provider: sources");
    expect(workspace).not.toContain("evidence.sourceUrl");
    expect(workspace).not.toContain('href={evidence.sourceUrl}');
  });

  it("keeps the permanent repository boundary explicit", () => {
    const policy = read("docs/USER_FACING_DATA_BOUNDARY.md");

    expect(policy).toContain("raw source URLs");
    expect(policy).toContain("raw article, document, feed or source content");
    expect(policy).toContain("internal search or retrieval payloads");
    expect(policy).toContain("provider names, provider/API implementation details");
    expect(policy).toContain("internal provenance, retrieval metadata");
  });
});
