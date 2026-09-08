import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("commercial website source-of-truth contract", () => {
  it("keeps intelligence products primary and technical proof secondary", () => {
    const shell = read("src/components/site-shell.tsx");

    expect(shell).toContain('label: "Intelligence"');
    expect(shell).toContain('label: "Global Risk Index"');
    expect(shell).toContain('label: "Risk Gate"');
    expect(shell).toContain('label: "Ask Geomacro"');
    expect(shell).toContain('label: "Data & API"');
    expect(shell).toContain('label: "For Institutions"');
    expect(shell).toContain("Technical Proof");
    expect(shell).toContain('label: "Prediction Markets"');
    expect(shell).toContain('label: "Bridge & Swap"');
  });

  it("keeps Risk Gate within the verified Private Pilot scope", () => {
    const route = read("src/routes/risk-gate.tsx");

    expect(route).toContain("PRIVATE PILOT");
    expect(route).toContain("country or directional corridor risk");
    expect(route).toContain("execution_authorized = false");
    expect(route).toContain("endpoint-composed pilot");
    expect(route).not.toContain("country, corridor and event risk");
  });

  it("keeps Arc, Circle and market routes explicitly technical proof", () => {
    for (const path of [
      "src/routes/arena.tsx",
      "src/routes/onchain.tsx",
      "src/routes/bridge-swap.tsx",
    ]) {
      expect(read(path)).toContain("TechnicalProofBanner");
    }
  });

  it("keeps the public GRI architecture on the three-domain v1.2 contract", () => {
    const gri = read("src/routes/docs_.gri-architecture.tsx");

    expect(gri).toContain('["Geopolitics", "1/3"]');
    expect(gri).toContain('["Macro", "1/3"]');
    expect(gri).toContain('["Rare earth / critical minerals", "1/3"]');
    expect(gri).toContain("not a current GRI v1.2 scoring domain");
    expect(gri).not.toContain("Base weight 25%");
  });

  it("uses the canonical commercial contact and sitemap host", () => {
    const contact = read("src/routes/contact.tsx");
    const robots = read("public/robots.txt");
    const sitemap = read("public/sitemap.xml");

    expect(contact).toContain("contact@geomacro.live");
    expect(robots).toContain("https://geomacro.live/sitemap.xml");
    expect(robots).not.toContain("https://www.geomacro.live/sitemap.xml");
    expect(sitemap).toContain("https://geomacro.live/risk-gate");
    expect(sitemap).toContain("https://geomacro.live/ask-geomacro");
    expect(sitemap).toContain("https://geomacro.live/data-api");
    expect(sitemap).toContain("https://geomacro.live/docs/51-summary");
  });
});
