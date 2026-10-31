import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SiteShell } from "../components/site-shell";
import { CommercialHome } from "../components/home/commercial-home";
import { intelligenceCategorySearch } from "../lib/intelligence-desk-view";

const paths = ["/", "/intelligence", "/risk-indices", "/ask-geomacro", "/data-api", "/pricing", "/contact", "/institutional", "/research", "/docs", "/about", "/roadmap", "/ecosystem"];
async function page(path = "/") {
  const root = createRootRoute({ component: () => createElement(SiteShell, null, createElement(CommercialHome)) });
  const children = paths.map((path) => createRoute({ getParentRoute: () => root, path }));
  const router = createRouter({ routeTree: root.addChildren(children), history: createMemoryHistory({ initialEntries: [path] }), isServer: true });
  await router.load();
  return renderToStaticMarkup(createElement(RouterProvider, { router }));
}

describe("homepage reader and buyer journeys", () => {
  it("explains the product before the optional news feed, with direct reader and buyer paths", async () => {
    const html = await page();
    expect((html.match(/<h1\b/g) ?? []).length).toBe(1);
    expect(html).toContain("Geomacro is a global intelligence platform.");
    expect(html.indexOf("Geomacro is a global intelligence platform.")).toBeLessThan(html.indexOf("Geomacro Finds"));
    for (const target of ["/intelligence", "/ask-geomacro", "/data-api", "/pricing", "/risk-indices", "/institutional"]) {
      expect(html).toContain(`href="${target}"`);
    }
    expect(html).toContain("API keys and self-service checkout coming soon.");
    expect(html).not.toMatch(/Generate structured JSON|Paste news text|Source license|payment-signature/);
  });

  it("keeps all primary destinations in the desktop navigation and marks the current page", async () => {
    const html = await page("/pricing");
    const nav = html.match(/<nav aria-label="Primary"[^>]*>([\s\S]*?)<\/nav>/)?.[1] ?? "";
    for (const target of ["/", "/intelligence", "/risk-indices", "/ask-geomacro", "/pricing"]) {
      expect(nav).toContain(`href="${target}"`);
    }
    const active = nav.match(/<a\b[^>]*href="\/pricing"[^>]*>/)?.[0] ?? "";
    expect(active).toContain('aria-current="page"');
    expect(html).toContain('id="main-content"');
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain('href="/about#privacy"');
  });

  it("preserves valid category deep links and points every navigation path at a registered UI route", async () => {
    const html = await page();
    for (const category of ["geopolitics", "macro", "rare_earth"]) {
      expect(html).toContain(`href="/intelligence?category=${category}"`);
      expect(intelligenceCategorySearch({ category })).toEqual({ category });
    }
    const generated = readFileSync("src/routeTree.gen.ts", "utf8");
    for (const path of paths) expect(generated).toContain(`'${path}'`);
  });
});
