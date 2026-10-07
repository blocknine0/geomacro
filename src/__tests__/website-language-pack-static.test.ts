import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const expectedCodes = ["en", "es", "fr", "de", "pt", "zh-CN", "zh-TW", "ja", "ko", "hi", "bn", "ar", "ru", "tr", "id"];

describe("website language pack", () => {
  it("keeps one shared controller with every supported language", () => {
    const source = read("public/geomacro-language.js");
    for (const code of expectedCodes) expect(source).toContain('["' + code + '",');
    expect(source).toContain("geomacro.website_language");
    expect(source).toContain("translate.google.com/translate?sl=en");
    expect(source).toContain("window.GeomacroLanguage");
  });

  it("loads language support across the commercial application", () => {
    expect(read("src/routes/__root.tsx")).toContain('<script src="/geomacro-language.js" defer />');
    const shell = read("src/components/site-shell.tsx");
    for (const code of expectedCodes) expect(shell).toContain('code: "' + code + '"');
    expect(shell).toContain("Choose website language");
    expect(shell).not.toContain("Testnet");
  });
});
