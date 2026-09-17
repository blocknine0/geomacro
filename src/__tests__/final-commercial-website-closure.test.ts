import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

const PRIMARY_ROUTES = [
  "src/routes/index.tsx",
  "src/routes/intelligence.tsx",
  "src/routes/global-risk.tsx",
  "src/routes/ask-geomacro.tsx",
  "src/routes/institutional.tsx",
  "src/routes/risk-gate.tsx",
  "src/routes/data-api.tsx",
  "src/routes/ecosystem.tsx",
  "src/routes/research.tsx",
  "src/routes/docs.tsx",
  "src/routes/about.tsx",
  "src/routes/roadmap.tsx",
  "src/routes/contact.tsx",
] as const;

const COMMERCIAL_NO_WALLET_ROUTES = [
  "src/routes/index.tsx",
  "src/routes/intelligence.tsx",
  "src/routes/global-risk.tsx",
  "src/routes/ask-geomacro.tsx",
  "src/routes/institutional.tsx",
  "src/routes/risk-gate.tsx",
  "src/routes/data-api.tsx",
  "src/routes/ecosystem.tsx",
  "src/routes/research.tsx",
  "src/routes/docs.tsx",
  "src/routes/about.tsx",
  "src/routes/roadmap.tsx",
  "src/routes/contact.tsx",
] as const;

function textFilesBelow(relativeDir: string): string[] {
  const root = join(ROOT, relativeDir);
  if (!existsSync(root)) return [];
  const output: string[] = [];
  const visit = (absolute: string) => {
    for (const name of readdirSync(absolute)) {
      const path = join(absolute, name);
      const stat = statSync(path);
      if (stat.isDirectory()) visit(path);
      else if (/\.(?:ts|tsx|md)$/.test(name)) output.push(path);
    }
  };
  visit(root);
  return output;
}

describe("final commercial website closure", () => {
  it("keeps the homepage a commercial explanation rather than a live dashboard", () => {
    const route = read("src/routes/index.tsx");
    const home = read("src/components/home/commercial-home.tsx");

    expect(route).toContain("Global Risk Intelligence Infrastructure | Geomacro");
    expect(home).toContain("Turn world events into");
    expect(home).toContain("Why adopt Geomacro");
    expect(home).toContain("Who it is for");
    expect(home).toContain("Product status");
    expect(home).toContain("Ecosystem & partnership");
    expect(home).toContain("Circle Alliance Program");
    expect(home).toContain("Work with Geomacro");
    expect(home).not.toContain("useIntelligence(");
    expect(home).not.toContain("useRiskIndices(");
    expect(home).not.toContain("114 / 194");
    expect(home).not.toContain("Live intelligence feed");
  });

  it("keeps every primary commercial route canonical and directly reachable", () => {
    for (const path of PRIMARY_ROUTES) {
      expect(existsSync(join(ROOT, path)), `missing primary route ${path}`).toBe(true);
      const source = read(path);
      expect(source, `missing canonical metadata in ${path}`).toContain('rel: "canonical"');
    }

    const shell = read("src/components/site-shell.tsx");
    for (const route of ["/intelligence", "/global-risk", "/institutional", "/ecosystem"]) {
      expect(shell).toContain(`to: "${route}"`);
    }
    expect(shell).toContain('to: "/contact"');
  });

  it("keeps public buyer and trust routes wallet-independent", () => {
    for (const path of COMMERCIAL_NO_WALLET_ROUTES) {
      const source = read(path);
      expect(source, `commercial route must not invoke wallet provider: ${path}`).not.toContain("useWallet(");
      expect(source, `commercial route must not render a connect-wallet CTA: ${path}`).not.toMatch(/Connect(?: testnet)? wallet/i);
    }

    const shell = read("src/components/site-shell.tsx");
    expect(shell).toContain('if (!address && !executionContext) return null;');
  });

  it("keeps commercial status claims explicit and customer execution controlled", () => {
    const riskGate = read("src/routes/risk-gate.tsx");
    const dataApi = read("src/routes/data-api.tsx");
    const about = read("src/routes/about.tsx");

    expect(riskGate).toContain("PRIVATE PILOT");
    expect(riskGate).toContain("execution_authorized = false");
    expect(dataApi).toContain("AgentCommerceStatus");
    expect(dataApi).toContain("Real-money x402 access stays fail-closed");
    expect(about).toContain("There is no claim of an independent external security audit");
    expect(about).toContain("Testnet USDC and testnet market activity are not represented as real-money production settlement");
  });

  it("keeps partnership trust evidence factual without implying endorsement", () => {
    const ecosystem = read("src/routes/ecosystem.tsx");
    const home = read("src/components/home/commercial-home.tsx");

    expect(ecosystem).toContain("https://partners.circle.com/partner/geomacro");
    expect(ecosystem).toContain("does not mean Circle endorses Geomacro");
    expect(home).toContain("It is ecosystem participation, not an endorsement");
    expect(ecosystem).not.toMatch(/Official Circle Partner/i);
    expect(home).not.toMatch(/Official Circle Partner/i);
  });

  it("keeps technical proof secondary, Testnet-bounded and out of primary search discovery", () => {
    const headers = read("src/lib/security-headers.ts");
    const sitemap = read("public/sitemap.xml");
    const technicalBanner = read("src/components/technical-proof-banner.tsx");
    const arena = read("src/routes/arena.tsx");
    const onchain = read("src/components/sections/onchain-section.tsx");
    const consolePage = read("server/routes/testnet-console.get.ts");

    for (const path of ["/arena", "/bridge-swap", "/demo", "/onchain", "/pipeline", "/portfolio", "/testnet-access"]) {
      expect(headers).toContain(`"${path}"`);
      expect(sitemap).not.toContain(`<loc>https://geomacro.live${path}</loc>`);
    }
    expect(technicalBanner).toContain("working technical proof is not a claim of general production availability");
    expect(arena).toContain("permanently Testnet-only");
    expect(arena).toContain("not planned for mainnet or real-money production use");
    expect(onchain).toContain("Geomacro mainnet transaction features remain intentionally disabled");
    expect(consolePage).toContain('meta name="robots" content="noindex,nofollow,noarchive"');
    expect(consolePage).toContain("Testnet only. No real-money production settlement.");
  });

  it("keeps one canonical identity for legacy public routes", () => {
    const feed = read("src/routes/feed.tsx");
    const bridge = read("src/routes/bridge.tsx");

    expect(feed).toContain('redirect({ to: "/intelligence", replace: true })');
    expect(bridge).toContain('to: "/bridge-swap"');
    expect(bridge).toContain("replace: true");
  });

  it("keeps featured documentation intelligence-first", () => {
    const docs = read("src/routes/docs.tsx");
    const entryBlock = docs.slice(docs.indexOf("const ENTRY_SLUGS"), docs.indexOf("function DocsIndexPage"));

    expect(entryBlock).toContain('"01-what-is-geomacro"');
    expect(entryBlock).toContain('"09-source-governance"');
    expect(entryBlock).toContain('"22-machine-readable-risk-objects"');
    expect(entryBlock).toContain('"28-partner-architecture"');
    expect(entryBlock).not.toContain('"34-prediction-markets"');
  });

  it("does not present versioned GRI proof as an independent external audit", () => {
    const publicSources = [
      ...textFilesBelow("src/routes"),
      ...textFilesBelow("src/components"),
      ...textFilesBelow("src/content/docs"),
    ];

    for (const absolute of publicSources) {
      const source = readFileSync(absolute, "utf8");
      expect(source, `unsupported audit wording in ${absolute}`).not.toMatch(/audited\s+GRI/i);
      expect(source, `unsupported audit wording in ${absolute}`).not.toMatch(/parent\s+audited\s+methodology/i);
      expect(source, `unsupported audit wording in ${absolute}`).not.toMatch(/audited\s+v1\.2/i);
    }
  });

  it("keeps the release source of truth and sitemap aligned with commercial hierarchy", () => {
    const architecture = read("docs/WEBSITE_INFORMATION_ARCHITECTURE.md");
    const sitemap = read("public/sitemap.xml");

    expect(architecture).toContain("commercial source of truth for the public website");
    expect(architecture).toContain("Risk Intelligence");
    expect(architecture).toContain("Ecosystem & partnerships");
    expect(architecture).toContain("Technical Proof");
    expect(architecture).toContain("Prediction markets remain permanently Testnet-only");

    for (const url of [
      "/intelligence",
      "/global-risk",
      "/risk-gate",
      "/ask-geomacro",
      "/data-api",
      "/institutional",
      "/ecosystem",
      "/research",
      "/docs",
      "/about",
      "/roadmap",
      "/contact",
    ]) {
      expect(sitemap).toContain(`<loc>https://geomacro.live${url}</loc>`);
    }
  });
});
