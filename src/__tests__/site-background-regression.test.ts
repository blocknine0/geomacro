import fs from "node:fs";
import { describe, expect, it } from "vitest";

const background = fs.readFileSync("src/components/animated-background.tsx", "utf8");
const shell = fs.readFileSync("src/components/site-shell.tsx", "utf8");

describe("canonical Geomacro site background", () => {
  it("keeps the network motif while bounding motion and mobile rendering cost", () => {
    expect(background).toContain('network-bg.png.asset.json');
    expect(background).toContain('animate-bg-drift');
    expect(background).toContain('<canvas');
    expect(background).toContain('(prefers-reduced-motion: reduce)');
    expect(background).toContain('mobile ? Math.max(12, Math.min(28, base))');
    expect(background).toContain('Math.min(window.devicePixelRatio || 1, 1.35)');
    expect(background).toContain('linear-gradient(to_bottom,rgba(8,11,17,0.74),rgba(8,11,17,0.9))');
  });

  it("mounts the background at the shared site shell", () => {
    expect(shell).toContain('import { AnimatedBackground } from "@/components/animated-background"');
    expect(shell).toContain('<AnimatedBackground />');
  });
});
