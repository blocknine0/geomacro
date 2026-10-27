import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { LiveIntelligenceShowcase } from "../components/home/live-intelligence-showcase";
import { findCardFromObservedRelease, type FindCardV1 } from "../lib/find-card-v1";

function knownCard() {
  const now = Date.now();
  const card = findCardFromObservedRelease({
    id: "geopolitics-1234abcd", category: "geopolitics",
    title: "Geomacro finds United Nations called for dialogue in its statement",
    what_changed: "United Nations called for dialogue in its dated statement. Further details remain subject to the original statement.",
    why_it_matters: "The statement matters to monitored diplomatic developments; its practical effects need confirmation.",
    topic: "foreign policy", geography: null, development_type: "official update",
    published_at: new Date(now - 3_600_000).toISOString(), date_precision: "exact",
    observed_release_count: 1, sources_credited: [], status: "official_release_observed_unscored",
    same_event_corrob_verified: false, severity: null,
  }, now);
  if (!card) throw Error("Invalid test card");
  return card;
}
async function render(cards: FindCardV1[]) {
  const root = createRootRoute({ component: () => createElement(LiveIntelligenceShowcase, { initialFindCards: cards }) });
  const router = createRouter({ routeTree: root, history: createMemoryHistory({ initialEntries: ["/"] }), isServer: true });
  await router.load();
  return renderToStaticMarkup(createElement(RouterProvider, { router }));
}
describe("homepage finding visibility", () => {
  it("renders an admitted called-for finding instead of the empty journal message", async () => {
    const card = knownCard();
    const html = await render([card]);
    expect(html).toContain(card.headline);
    expect(html).toContain(`dateTime="${card.published_at}"`);
    expect(html).not.toContain("No highlights to show right now.");
    expect(html).not.toContain("No eligible public release");
    expect(html).not.toContain("No eligible concrete news");
  });
  it("keeps quiet categories navigable without inventing or duplicating their stories", async () => {
    const html = await render([knownCard()]);
    for (const category of ["geopolitics", "macro", "rare_earth"]) {
      expect(html).toContain(`href="/intelligence?category=${category}"`);
    }
    expect((html.match(/<h2\b/g) ?? []).length).toBe(1);
    expect(html).not.toContain("No eligible concrete news");
  });
  it("continues rejecting anonymous cards and provides an honest status with useful navigation", async () => {
    const html = await render([{ ...knownCard(), headline: "Actor not verified: geopolitical publisher candidate" }]);
    expect(html).not.toContain("Actor not verified");
    expect(html).toContain("No highlights to show right now.");
    expect(await render([])).toContain("Loading Geomacro findings");
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-label="Browse intelligence topics"');
    expect(html).not.toContain("No eligible concrete news");
  });
});
