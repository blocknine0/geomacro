import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const docsDir = join(process.cwd(), "src/content/docs");
const read = (path: string) => readFileSync(path, "utf8");

describe("commercial documentation public vocabulary", () => {
  it("keeps public docs focused on development gists and independent evidence, not publication-format labels", () => {
    const markdown = readdirSync(docsDir).filter((file) => file.endsWith(".md"));
    expect(markdown.length).toBeGreaterThan(30);
    for (const filename of markdown) {
      const content = read(join(docsDir, filename));
      expect(content, filename).not.toMatch(/\barticles?\b/iu);
    }
  });

  it("serves Geomacro docs as website pages, not news publications", () => {
    const route = read(join(process.cwd(), "src/routes/docs_.$slug.tsx"));
    expect(route).toContain('{ property: "og:type", content: "website" }');
    expect(route).toContain('"@type": "WebPage"');
    expect(route).not.toContain('"@type": "TechArticle"');
  });

  it("retains source-independence and duplicate-evidence explanations", () => {
    const s = read(join(docsDir, "06-source-independence.md"));
    expect(s).toContain("Source concentration");
    expect(s).toContain("Story concentration");
    expect(s).toContain("20 URLs ≠ 20 independent confirmations");
    expect(s).toContain("independent-story count");
  });
});
