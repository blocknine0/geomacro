import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("clipboard compatibility contract", () => {
  it("installs a native-write fallback at the application root", () => {
    const root = readFileSync(resolve(__dirname, "../routes/__root.tsx"), "utf8");
    const compat = readFileSync(resolve(__dirname, "../lib/clipboard-compat.ts"), "utf8");
    expect(root).toContain("installClipboardCompatibility");
    expect(compat).toContain("navigator.clipboard");
    expect(compat).toContain('document.execCommand("copy")');
  });
});
