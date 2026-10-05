import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const ask = readFileSync("src/components/ask/ask-workspace.tsx", "utf8");
const pipeline = readFileSync("src/components/sections/pipeline-section.tsx", "utf8");
const demo = readFileSync("src/routes/demo.tsx", "utf8");
const liquidity = readFileSync("src/components/sections/liquidity-section.tsx", "utf8");
const bridge = readFileSync("src/components/sections/bridge-section.tsx", "utf8");
const swap = readFileSync("src/components/sections/swap-section.tsx", "utf8");
const intelligence = readFileSync("src/routes/intelligence.tsx", "utf8");

describe("#1128 mobile information hierarchy", () => {
  it("keeps Ask Geomacro compact, wrapping and evidence-preserving on mobile", () => {
    expect(ask).toContain('className="mx-auto w-full max-w-5xl px-4');
    expect(ask).toContain('className="space-y-7"');
    expect(ask).toContain('max-w-[88%]');
    expect(ask).toContain('break-words');
    expect(ask).toContain("Evidence (");
  });

  it("keeps the pipeline stacked first and preserves section hierarchy", () => {
    expect(pipeline).toContain('grid grid-cols-1');
    expect(pipeline).toContain('sm:grid-cols-2');
    expect(pipeline).toContain('flex flex-col gap-1');
    expect(pipeline).toContain('sm:flex-row');
    expect(pipeline).toContain('px-4 py-12');
  });

  it("keeps the agent demo long records and code blocks scanable without viewport overflow", () => {
    expect(demo).toContain('max-h-80 overflow-auto whitespace-pre-wrap break-words');
    expect(demo).toContain('min-w-0 break-all font-mono');
    expect(demo).toContain('overflow-auto whitespace-pre-wrap break-words');
    expect(demo).toContain('grid gap-6 lg:grid-cols');
  });

  it("keeps bridge and swap mobile-first instead of desktop-width-first", () => {
    expect(liquidity).toContain('max-w-3xl px-4 py-10 sm:px-6');
    expect(liquidity).toContain('max-w-3xl grid-cols-2 px-4 sm:px-6');
    expect(liquidity).toContain('max-w-3xl px-4 py-12 sm:px-6 sm:py-16');
    expect(bridge).toContain('p-4 sm:p-6');
    expect(bridge).toContain('flex flex-col gap-3 sm:flex-row');
    expect(swap).toContain('p-4 sm:p-6');
    expect(swap).toContain('flex flex-col gap-3 sm:flex-row');
  });

  it("keeps current Intelligence responsive as required by the launch master", () => {
    expect(intelligence).toContain('max-w-7xl px-4 py-8 sm:px-6');
    expect(intelligence).toContain('grid min-w-0 gap-8 lg:grid-cols');
    expect(intelligence).toContain('flex flex-wrap items-center');
  });
});
