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
    expect(background).toContain('const mobile = width < 768;');
    expect(background).toContain('Math.max(12, Math.min(28, base))');
    expect(background).toContain('Math.max(24, Math.min(62, base))');
    expect(background).toContain('Math.min(window.devicePixelRatio || 1, 1.35)');
    expect(background).toContain('linear-gradient(to_bottom,rgba(8,11,17,0.74),rgba(8,11,17,0.9))');
  });

  it("uses the CSS globe theme without continuous canvas work", () => {
    expect(shell).not.toContain('import { AnimatedBackground }');
    expect(shell).not.toContain('<AnimatedBackground />');
    expect(shell).toContain('gm-site');
  });
  it("keeps decorative motion pausable, reduced-motion safe and out of the interaction layer", () => {
    const theme = fs.readFileSync("src/components/intelligence-background.tsx", "utf8");
    const css = fs.readFileSync("src/styles.css", "utf8");
    expect(theme).toContain('aria-hidden="true"');
    expect(theme).not.toMatch(/<canvas|fetch\(|setInterval|requestAnimationFrame/);
    expect(css).toContain('pointer-events: none');
    expect(css).toContain('(prefers-reduced-motion: reduce)');
    expect(css).toContain('animation-play-state: paused !important');
    expect(shell).toContain('Pause background animation');
    expect(shell).toContain('aria-pressed={motionPaused}');
    expect(shell).toContain('geomacro.background-paused');
  });

  it("keeps body and secondary copy above WCAG AA normal-text contrast on both content surfaces", () => {
    const css = fs.readFileSync("src/styles.css", "utf8");
    const theme = css.match(/\.gm-site \{([^}]+)\}/)?.[1] ?? "";
    const color = (name: string) => theme.match(new RegExp(`--${name}: (#[0-9a-f]{6})`))![1];
    const luminance = (hex: string) => {
      const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map((v) => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
      return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
    };
    for (const text of ["foreground", "muted-foreground", "primary"]) {
      for (const surface of ["background", "card"]) {
        const a = luminance(color(text)), b = luminance(color(surface));
        expect((Math.max(a, b) + .05) / (Math.min(a, b) + .05)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

});
