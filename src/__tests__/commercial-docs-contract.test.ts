import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

type ManifestEntry = {
  slug: string;
  title: string;
  route: string;
  previous: string | null;
  next: string | null;
  page_number: number;
  page_count: number;
};

const ROOT = process.cwd();
const DOCS_DIR = join(ROOT, "src/content/docs");
const MANIFEST_PATH = join(ROOT, "src/content/docs-manifest.json");

function manifest(): ManifestEntry[] {
  return JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as ManifestEntry[];
}

function markdownTitle(slug: string): string {
  const markdown = readFileSync(join(DOCS_DIR, `${slug}.md`), "utf8");
  const h1 = markdown.match(/^#\s+(?:\d+\.\s+)?(.+)$/m);
  if (!h1) throw new Error(`Missing H1 in ${slug}.md`);
  return h1[1].trim();
}

describe("commercial documentation contract", () => {
  it("keeps the 52-page manifest and markdown corpus in sync", () => {
    const entries = manifest();
    const markdownFiles = readdirSync(DOCS_DIR)
      .filter((name) => name.endsWith(".md"))
      .sort();
    const expectedFiles = entries.map((entry) => `${entry.slug}.md`).sort();

    expect(entries).toHaveLength(52);
    expect(markdownFiles).toEqual(expectedFiles);
    expect(new Set(entries.map((entry) => entry.slug)).size).toBe(52);

    const mismatches: string[] = [];
    entries.forEach((entry, index) => {
      const expectedPrevious = index === 0 ? null : entries[index - 1].slug;
      const expectedNext = index === entries.length - 1 ? null : entries[index + 1].slug;
      const actualTitle = markdownTitle(entry.slug);

      if (entry.page_number !== index + 1) {
        mismatches.push(`${entry.slug}: page_number ${entry.page_number} != ${index + 1}`);
      }
      if (entry.page_count !== 52) {
        mismatches.push(`${entry.slug}: page_count ${entry.page_count} != 52`);
      }
      if (entry.route !== `/docs/${entry.slug}`) {
        mismatches.push(`${entry.slug}: route ${entry.route} != /docs/${entry.slug}`);
      }
      if (entry.previous !== expectedPrevious) {
        mismatches.push(`${entry.slug}: previous ${String(entry.previous)} != ${String(expectedPrevious)}`);
      }
      if (entry.next !== expectedNext) {
        mismatches.push(`${entry.slug}: next ${String(entry.next)} != ${String(expectedNext)}`);
      }
      if (entry.title !== actualTitle) {
        mismatches.push(`${entry.slug}: title \"${entry.title}\" != \"${actualTitle}\"`);
      }
    });

    expect(mismatches).toEqual([]);
  });

  it("documents the current three-domain GRI v1.2 contract", () => {
    const componentReliability = readFileSync(
      join(DOCS_DIR, "15-component-reliability.md"),
      "utf8",
    );
    const normalization = readFileSync(join(DOCS_DIR, "19-normalization.md"), "utf8");

    expect(componentReliability).toContain("geopolitics");
    expect(componentReliability).toContain("macroeconomics");
    expect(componentReliability).toContain("rare earth / critical-mineral risk");
    expect(componentReliability).toContain("not a GRI v1.2 scoring domain");
    expect(normalization).toContain("geopolitics = 1/3");
    expect(normalization).toContain("macro       = 1/3");
    expect(normalization).toContain("rare_earth  = 1/3");
  });

  it("keeps Risk Gate and technical-proof boundaries explicit", () => {
    const riskObject = readFileSync(
      join(DOCS_DIR, "22-machine-readable-risk-objects.md"),
      "utf8",
    );
    const corridor = readFileSync(join(DOCS_DIR, "31-corridor-risk.md"), "utf8");
    const markets = readFileSync(join(DOCS_DIR, "34-prediction-markets.md"), "utf8");
    const disclaimer = readFileSync(join(DOCS_DIR, "50-disclaimer.md"), "utf8");

    expect(riskObject).toContain("PRIVATE PILOT");
    expect(corridor).toContain("directional endpoint-composed pilot");
    expect(markets).toContain("TECHNICAL PROOF");
    expect(disclaimer).toContain("execution_authorized=false");
  });
});
