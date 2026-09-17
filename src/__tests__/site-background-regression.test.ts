import fs from "node:fs";
import { describe, expect, it } from "vitest";

const background = fs.readFileSync("src/components/animated-background.tsx", "utf8");
const shell = fs.readFileSync("src/components/site-shell.tsx", "utf8");

describe("canonical Geomacro site background", () => {
  it("keeps the original network background implementation", () => {
    expect(background).toContain('network-bg.png.asset.json');
    expect(background).toContain('animate-bg-drift');
    expect(background).toContain('<canvas');
    expect(background).toContain('rgba(11, 15, 25, 0.75)');
  });

  it("mounts the background at the shared site shell", () => {
    expect(shell).toContain('import { AnimatedBackground } from "@/components/animated-background"');
    expect(shell).toContain('<AnimatedBackground />');
  });
});
