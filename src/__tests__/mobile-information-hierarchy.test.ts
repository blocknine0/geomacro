import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const ask = readFileSync("src/components/ask/ask-workspace.tsx", "utf8");
const intelligence = readFileSync("src/routes/intelligence.tsx", "utf8");
const shell = readFileSync("src/components/site-shell.tsx", "utf8");

describe("#1128 mobile information hierarchy", () => {
  it("keeps Ask Geomacro compact and evidence-preserving on mobile", () => {
    expect(ask).toContain('className="mx-auto w-full max-w-5xl px-4');
    expect(ask).toContain('max-w-[88%]');
    expect(ask).toContain("break-words");
    expect(ask).toContain("Evidence (");
  });

  it("keeps current Intelligence responsive", () => {
    expect(intelligence).toContain('max-w-7xl px-4 py-8 sm:px-6');
    expect(intelligence).toContain('grid min-w-0 gap-8 lg:grid-cols');
    expect(intelligence).toContain('flex flex-wrap items-center');
  });

  it("keeps mobile navigation focused on commercial surfaces", () => {
    expect(shell).toContain('<MobileGroup title="Core" items={PRIMARY_NAV} />');
    expect(shell).toContain('<MobileGroup title="Explore" items={exploreMobile} />');
    expect(shell).not.toContain('title="Technical proof"');
    expect(shell).not.toContain("/testnet-access");
  });
});
