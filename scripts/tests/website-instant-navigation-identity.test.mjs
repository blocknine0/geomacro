import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { test } from "node:test";

const read = (path) => readFileSync(path, "utf8");
const router = read("src/router.tsx");
const shell = read("src/components/site-shell.tsx");
const home = read("src/components/home/commercial-home.tsx");
const editorial = read("src/components/editorial-page.tsx");
const intelligence = read("src/routes/intelligence.tsx");
const homeRoute = read("src/routes/index.tsx");
const css = read("src/styles.css");
const lock = JSON.parse(read("config/website-lock.json"));

test("all primary and secondary page navigation uses SPA links", () => {
  for (const route of ["/", "/intelligence", "/risk-indices", "/ask-geomacro", "/pricing",
    "/institutional", "/ecosystem", "/research", "/docs", "/about", "/roadmap", "/contact"]) {
    assert.ok(shell.includes(`to: "${route}"`), `Missing in site navigation: ${route}`);
  }
  assert.match(shell, /const navigationPending = useRouterState/);
  assert.match(shell, /gm-route-progress-active/);
  assert.match(router, /defaultPreload: "intent"/);
  assert.match(router, /defaultPreloadStaleTime: 30_000/);
});
test("internal destination headings are accessible client links", () => {
  assert.match(editorial, /<Link to=\{item\.href as "\/intelligence"\}/);
  assert.match(editorial, /gm-heading-link/);
  for (const href of ["/ask-geomacro", "/pricing"]) {
    assert.ok(home.includes(`to="${href}" className="gm-heading-link"`),
      `Missing home section destination heading for ${href}`);
  }
  assert.match(home, /to="\/intelligence"/);
  assert.doesNotMatch(home, /home-finds-title/);
  assert.doesNotMatch(home, /LiveIntelligenceShowcase/);
  assert.doesNotMatch(home, /What GeoMacro is finding now/);
});
test("client transitions do not block on 9s intelligence publisher request", () => {
  assert.match(intelligence, /if \(typeof window !== "undefined"\)/);
  assert.match(intelligence, /stateless: null, statelessFeeds: \{\}, journal: \[\]/);
  assert.match(intelligence, /const \[geopolitics, macro, minerals, history\]/);
  assert.match(intelligence, /getStatelessIntelligence/);
});
test("premium CSS identity respects accessibility and mobile performance", () => {
  assert.match(css, /\.gm-premium-header/);
  assert.match(css, /\.gm-heading-link:focus-visible/);
  assert.match(css, /\.gm-hero:before/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /\.gm-route-progress-active/);
  assert.match(css, /background-attachment: scroll/);
});
test("the explicit approval locks only six exact blobs, never Global Risk or PREDGE", () => {
  const approval = lock.approved_navigation_theme_20261101;
  assert.equal(approval.exact_blob_lock, true);
  assert.equal(approval.payment_authorized, false);
  assert.equal(approval.predge_unmodified, true);
  assert.equal(approval.global_risk_final_lock_unmodified, true);
  assert.deepEqual(approval.approved_paths.slice().sort(), [
    "src/router.tsx","src/routes/intelligence.tsx","src/components/site-shell.tsx",
    "src/components/editorial-page.tsx","src/components/home/commercial-home.tsx",
    "src/styles.css"].sort());
});

test("Home remains instant with client-only public-static highlights and no blocking route loader", () => {
  assert.doesNotMatch(homeRoute, /\bloader\s*:/);
  assert.doesNotMatch(homeRoute, /fetchDailyOfficialFinds|fetchDirectDerivedNews/);
  assert.match(homeRoute, /<CommercialHome \/>/);
  assert.doesNotMatch(home, /LiveIntelligenceShowcase/);
  assert.equal(lock.approved_homepage_fresh_unverified_lane_20261102.exact_blob_lock, true);
  assert.equal(lock.approved_homepage_fresh_unverified_lane_20261102.payment_authorized, false);
  assert.equal(lock.approved_home_navigation_20261101.exact_blob_lock, true);
  assert.deepEqual(lock.approved_home_navigation_20261101.approved_paths, ["src/routes/index.tsx"]);
});
