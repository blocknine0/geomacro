import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

type ManifestEntry = {
  slug: string;
  route: string;
  previous: string | null;
  next: string | null;
  page_number: number;
  page_count: number;
};

const ROOT = process.cwd();
const DOCS_DIR = join(ROOT, "src/content/docs");
const MANIFEST_PATH = join(ROOT, "src/content/docs-manifest.json");
const manifest = () => JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as ManifestEntry[];

describe("commercial documentation contract", () => {
  it("keeps the 48-page commercial manifest and markdown corpus in sync", () => {
    const entries = manifest();
    const markdownFiles = readdirSync(DOCS_DIR).filter((name) => name.endsWith(".md")).sort();
    expect(entries).toHaveLength(48);
    expect(markdownFiles).toEqual(entries.map((entry) => entry.slug + ".md").sort());
    entries.forEach((entry, index) => {
      expect(entry.page_number).toBe(index + 1);
      expect(entry.page_count).toBe(48);
      expect(entry.route).toBe("/docs/" + entry.slug);
      expect(entry.previous).toBe(index === 0 ? null : entries[index - 1].slug);
      expect(entry.next).toBe(index === entries.length - 1 ? null : entries[index + 1].slug);
    });
  });

  it("does not include retired experimental documentation", () => {
    const slugs = manifest().map((entry) => entry.slug);
    for (const slug of ["34-prediction-markets", "35-cctp-bridge-and-swap", "36-arc-testnet", "37-research-and-experimental-layers"]) {
      expect(slugs).not.toContain(slug);
    }
  });

  it("keeps Risk Gate and production-gated machine access explicit", () => {
    expect(readFileSync(join(DOCS_DIR, "22-machine-readable-risk-objects.md"), "utf8")).toContain("PRIVATE PILOT");
    expect(readFileSync(join(DOCS_DIR, "49-commercial-availability.md"), "utf8")).toContain("PRODUCTION GATED");
    expect(readFileSync(join(DOCS_DIR, "50-disclaimer.md"), "utf8")).toContain("execution_authorized=false");
  });
});
