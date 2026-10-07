import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

type DocsManifestEntry = { route: string };

const PRIMARY_INDEXABLE_ROUTES = [
  "https://geomacro.live/",
  "https://geomacro.live/intelligence",
  "https://geomacro.live/global-risk",
  "https://geomacro.live/risk-gate",
  "https://geomacro.live/ask-geomacro",
  "https://geomacro.live/data-api",
  "https://geomacro.live/pricing",
  "https://geomacro.live/institutional",
  "https://geomacro.live/ecosystem",
  "https://geomacro.live/research",
  "https://geomacro.live/docs",
  "https://geomacro.live/about",
  "https://geomacro.live/roadmap",
  "https://geomacro.live/contact",
] as const;

describe("public SEO contract", () => {
  it("publishes one canonical organization and website identity", () => {
    const root = read("src/routes/__root.tsx");
    expect(root).toContain('"@type": "Organization"');
    expect(root).toContain('"@id": "https://geomacro.live/#organization"');
    expect(root).toContain('"@type": "WebSite"');
    expect(root).toContain('"@id": "https://geomacro.live/#website"');
  });

  it("keeps every commercial route in the sitemap and retired product routes out", () => {
    const sitemap = read("public/sitemap.xml");
    for (const url of PRIMARY_INDEXABLE_ROUTES) expect(sitemap).toContain("<loc>" + url + "</loc>");
    for (const marker of ["testnet", "bridge-swap", "prediction-market", "arc-testnet", "/arena", "/onchain"]) {
      expect(sitemap.toLowerCase()).not.toContain(marker);
    }
  });

  it("keeps every documentation route synchronized with the sitemap", () => {
    const sitemap = read("public/sitemap.xml");
    const manifest = JSON.parse(read("src/content/docs-manifest.json")) as DocsManifestEntry[];
    expect(manifest).toHaveLength(48);
    for (const entry of manifest) expect(sitemap).toContain("<loc>https://geomacro.live" + entry.route + "</loc>");
  });

  it("preserves search-console verification and crawler policy", () => {
    expect(existsSync(join(ROOT, "public/google9b43beb9d90523c5.html"))).toBe(true);
    const robots = read("public/robots.txt");
    expect(robots).toContain("Disallow: /api/");
    expect(robots).toContain("Disallow: /internal/");
    expect(robots.toLowerCase()).not.toContain("testnet");
    expect(robots).toContain("Sitemap: https://geomacro.live/sitemap.xml");
  });

  it("keeps AI discovery commercial-only", () => {
    const llms = read("public/llms.txt");
    expect(llms).toContain("Risk Intelligence: LIVE");
    expect(llms).toContain("Risk Gate: PRIVATE PILOT");
    expect(llms).toContain("PRODUCTION GATED");
    expect(llms.toLowerCase()).not.toMatch(/testnet|prediction market|bridge & swap|arc testnet/);
  });
});
