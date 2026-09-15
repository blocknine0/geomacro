import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

const PRIMARY_INDEXABLE_ROUTES = [
  "https://geomacro.live/",
  "https://geomacro.live/intelligence",
  "https://geomacro.live/global-risk",
  "https://geomacro.live/risk-gate",
  "https://geomacro.live/ask-geomacro",
  "https://geomacro.live/data-api",
  "https://geomacro.live/institutional",
  "https://geomacro.live/research",
  "https://geomacro.live/docs",
  "https://geomacro.live/about",
  "https://geomacro.live/roadmap",
  "https://geomacro.live/contact",
] as const;

const SECONDARY_NOINDEX_ROUTES = [
  "https://geomacro.live/arena",
  "https://geomacro.live/bridge-swap",
  "https://geomacro.live/demo",
  "https://geomacro.live/onchain",
  "https://geomacro.live/pipeline",
  "https://geomacro.live/testnet-access",
] as const;

describe("public SEO contract", () => {
  it("publishes one canonical organization and website identity", () => {
    const root = read("src/routes/__root.tsx");

    expect(root).toContain('"@type": "Organization"');
    expect(root).toContain('"@id": "https://geomacro.live/#organization"');
    expect(root).toContain('"@type": "WebSite"');
    expect(root).toContain('"@id": "https://geomacro.live/#website"');
    expect(root).toContain('name: "application-name", content: "Geomacro"');
    expect(root).toContain('property: "og:locale", content: "en_US"');
    expect(root).not.toContain('{ name: "twitter:title", content: DEFAULT_TITLE }');
  });

  it("keeps the homepage intelligence-first with complete crawl metadata", () => {
    const home = read("src/routes/index.tsx");

    expect(home).toContain("Geopolitical & Macro Risk Intelligence | Geomacro");
    expect(home).toContain('name: "robots", content: "index, follow');
    expect(home).toContain('rel: "canonical"');
    expect(home).toContain('name: "twitter:title"');
    expect(home).toContain('"@type": "WebApplication"');
  });

  it("server-renders unique intelligence event metadata and body data", () => {
    const route = read("src/routes/event.$eventId.tsx");
    const workspace = read("src/components/intelligence/event-detail-workspace.tsx");
    const publicSeo = read("src/lib/public-event-seo.functions.ts");

    expect(route).toContain("getPublicEventSeoDetail");
    expect(route).toContain("loaderData.source_title");
    expect(route).toContain('property: "og:type", content: "article"');
    expect(route).toContain('"@type": "BreadcrumbList"');
    expect(route).toContain("initialEvent={event}");
    expect(workspace).toContain("initialEvent?: PublicEventDetail | null");
    expect(workspace).not.toContain("document.title =");
    expect(publicSeo).toContain('createServerFn({ method: "GET" })');
    expect(publicSeo).not.toContain("assertSameOrigin");
  });

  it("uses content-specific descriptions and article schema for docs pages", () => {
    const docsRoute = read("src/routes/docs_.$slug.tsx");
    const docsIndex = read("src/routes/docs.tsx");

    expect(docsRoute).toContain("docsDescription(page.markdown, page.title)");
    expect(docsRoute).toContain('"@type": "TechArticle"');
    expect(docsRoute).toContain('"@type": "BreadcrumbList"');
    expect(docsIndex).toContain('"@type": "CollectionPage"');
    expect(docsIndex).toContain("numberOfItems: DOCS_PAGE_COUNT");
  });

  it("keeps technical proof and tester surfaces out of the sitemap", () => {
    const sitemap = read("public/sitemap.xml");

    for (const url of PRIMARY_INDEXABLE_ROUTES) {
      expect(sitemap, `missing primary SEO URL: ${url}`).toContain(`<loc>${url}</loc>`);
    }
    for (const url of SECONDARY_NOINDEX_ROUTES) {
      expect(sitemap, `secondary surface should not be in sitemap: ${url}`).not.toContain(`<loc>${url}</loc>`);
    }
    expect(sitemap).toContain("https://geomacro.live/docs/51-summary");
  });

  it("allows crawlers to see noindex HTML while blocking machine/internal paths", () => {
    const robots = read("public/robots.txt");
    const headers = read("src/lib/security-headers.ts");

    expect(robots).toContain("Disallow: /api/");
    expect(robots).toContain("Disallow: /internal/");
    expect(robots).toContain("Disallow: /testnet-console");
    expect(robots).not.toContain("Disallow: /demo");
    expect(headers).toContain('"/arena"');
    expect(headers).toContain('"/testnet-access"');
    expect(headers).toContain('"noindex, follow, noarchive"');
    expect(headers).toContain('"noindex, nofollow, noarchive"');
  });

  it("keeps social assets and AI discovery references resolvable in the build", () => {
    expect(existsSync(join(ROOT, "public/og-image-v2.png"))).toBe(true);
    expect(existsSync(join(ROOT, "public/og-signal-card-v2.png"))).toBe(true);
    expect(existsSync(join(ROOT, "public/llms.txt"))).toBe(true);

    const llms = read("public/llms.txt");
    expect(llms).toContain("Risk Intelligence: LIVE");
    expect(llms).toContain("Risk Gate: PRIVATE PILOT");
    expect(llms).toContain("TECHNICAL PROOF");
  });
});
