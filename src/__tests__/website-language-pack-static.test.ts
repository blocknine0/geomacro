import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const expectedCodes = ["en", "es", "fr", "de", "pt", "zh-CN", "zh-TW", "ja", "ko", "hi", "bn", "ar", "ru", "tr", "id"];

describe("website language pack", () => {
  it("keeps one shared controller with every supported language", () => {
    const source = read("public/geomacro-language.js");
    for (const code of expectedCodes) expect(source).toContain('["' + code + '",');
    expect(source).toContain("geomacro.website_language");
    expect(source).toContain('new URL("https://translate.google.com/translate")');
    expect(source).toContain('translated.searchParams.set("tl", code)');
    expect(source).toContain('translated.searchParams.set("u", source.toString())');
    expect(source).toContain('current.hostname.endsWith(".translate.goog")');
    expect(source).toContain("original.hash = current.hash");
    expect(source).not.toContain("handleMenuLanguage");
    expect(source).not.toContain('addEventListener("pointerdown",');
    expect(source).not.toContain('addEventListener("click",');
    expect(source).toContain("window.GeomacroLanguage");
  });

  it("preserves deep routes, search parameters and fragments during language changes", () => {
    const source = read("public/geomacro-language.js");
    const runController = (href: string) => {
      const assigned: string[] = [];
      const document = {
        addEventListener: () => undefined,
        querySelectorAll: () => [],
        querySelector: () => null,
        documentElement: {},
        body: { appendChild: () => undefined },
      };
      class MockMutationObserver {
        constructor(_callback: () => void) {}
        observe() {}
      }
      const window = {
        location: {
          href,
          protocol: new URL(href).protocol,
          assign: (url: string) => assigned.push(url),
        },
        localStorage: { setItem: () => undefined, getItem: () => null },
      };
      runInNewContext(source, {
        window,
        document,
        MutationObserver: MockMutationObserver,
        URL,
        Set,
        Object,
        HTMLSelectElement: class {},
      });
      return { window, assigned };
    };

    const original = "https://geomacro.live/intelligence?category=macro&query=copper#main";
    const first = runController(original);
    first.window.GeomacroLanguage?.navigate("bn");
    expect(first.assigned).toHaveLength(1);
    const translated = new URL(first.assigned[0]);
    expect(translated.hostname).toBe("translate.google.com");
    expect(translated.pathname).toBe("/translate");
    expect(translated.searchParams.get("tl")).toBe("bn");
    expect(translated.searchParams.get("u")).toBe(original);

    const proxy = runController(
      "https://geomacro-live.translate.goog/intelligence?category=macro&_x_tr_sl=auto&_x_tr_tl=bn&_x_tr_hl=en#latest",
    );
    proxy.window.GeomacroLanguage?.navigate("en");
    expect(proxy.assigned).toEqual([
      "https://geomacro.live/intelligence?category=macro#latest",
    ]);
  });

  it("loads language support across the commercial application", () => {
    expect(read("src/routes/__root.tsx")).toContain('<script src="/geomacro-language.js" defer />');
    const shell = read("src/components/site-shell.tsx");
    for (const code of expectedCodes) expect(shell).toContain('code: "' + code + '"');
    expect(shell).toContain("Choose website language");
    expect(shell).toContain("controller.navigate(code)");
    expect(shell).toContain("https://translate.google.com/translate");
    expect(shell).toContain("geomacro.website_language");
    expect(shell).toContain("source.searchParams.delete(key)");
    expect(shell).not.toContain("translate.google.com/translate?sl=auto");
    expect(shell).not.toContain("Testnet");
  });
});
