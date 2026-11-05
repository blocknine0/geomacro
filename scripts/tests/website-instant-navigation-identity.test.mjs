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
const lockVerifier = read("scripts/ops/verify-website-lock.mjs");

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
  assert.equal(lock.approved_permanent_home_finds_removal_20261102.exact_blob_lock, true);
  assert.equal(lock.approved_permanent_home_finds_removal_20261102.permanent_unmounted_assertion, true);
  assert.match(lockVerifier, /GEOMACRO_PERMANENT_HOMEPAGE_FINDS_REMOVAL_VIOLATION/);
  assert.match(lockVerifier, /approved_permanent_home_finds_removal_20261102/);
  assert.deepEqual(lock.approved_home_navigation_20261101.approved_paths, ["src/routes/index.tsx"]);
});

test("live website audit compares only active catalog rows, not retired prices", async () => {
  const {assertPublicPriceManifest} = await import("../lib/website-live-audit-contract.mjs");
  const catalog=[{
    capability:"intelligence_query",launch_status:"ELIGIBILITY_GATED",
    new_sales_allowed:true,variants:[{variant:"focused",amount_usdc:"0.02",amount_atomic:"20000"}],
  }];
  const manifest={
    pricing_version:"geomacro.capability-usdc.v2",capability_count:1,price_variant_count:1,
    capabilities:[{capability:"intelligence_query",launch_status:"ELIGIBILITY_GATED",
      new_sales_allowed:true,variants:[{variant:"focused",price_usdc:"0.02",
        amount_atomic:"20000",currency:"USDC",
        nonpayable_network_previews:[{payable_offer_issued:false}]}]}],
    payment_authorized:false,money_transferred:false,
    x402_payment_requirement_issued:false,live_commercial_product_available_by_price_listing:false,
  };
  assert.deepEqual(assertPublicPriceManifest(manifest,catalog,"geomacro.capability-usdc.v2"),
    {capabilities:1,price_variants:1});
  assert.throws(()=>assertPublicPriceManifest({...manifest,price_variant_count:14},catalog,
    "geomacro.capability-usdc.v2"),/PUBLIC_PRICE_CATALOG_SCOPE_MISMATCH/);
  assert.throws(()=>assertPublicPriceManifest({...manifest,money_transferred:true},catalog,
    "geomacro.capability-usdc.v2"),/PUBLIC_PRICE_DISCOVERY_PAYMENT_BOUNDARY_BROKEN/);
  assert.throws(()=>assertPublicPriceManifest({...manifest,capabilities:[
    ...manifest.capabilities,{...manifest.capabilities[0],capability:"gri_read"}]},catalog,
    "geomacro.capability-usdc.v2"),/PUBLIC_PRICE_CATALOG_SCOPE_MISMATCH/);
});

test("outside-in Store check verifies actual plans, packs and locked checkout", async () => {
  const {assertLockedStorefront} = await import("../lib/website-live-audit-contract.mjs");
  const html=String.raw`<main>Payments locked · no charge Live checkout locked · no charge
    PayPal / card checkout Manual transfer / QR
    <article data-plan-id="starter_dev"><span>$9</span><span>1,000 credits</span></article>
    <article data-pack-id="starter_pack"><span>$5</span><span>100 credits</span></article>
  </main>`;
  const plans=[{id:"starter_dev",price_usd:9,credits_per_30_days:1000}];
  const packs=[{id:"starter_pack",price_usd:5,credits:100}];
  assert.deepEqual(assertLockedStorefront(html,plans,packs),
    {plans:1,packs:1,checkout_locked:true});
  assert.throws(()=>assertLockedStorefront(html.replace("$9","$99"),plans,packs),
    /PUBLIC_STORE_PLAN_PRICE_MISMATCH/);
  assert.throws(()=>assertLockedStorefront(html.replace("Payments locked · no charge",""),plans,packs),
    /PUBLIC_STORE_LOCKED_PRESENTATION_MISMATCH/);
});

test("legacy /data-api redirect, exact build SHA and static audit scope are enforced", async () => {
  const {assertStoreAlias,assertBuildMarker} = await import("../lib/website-live-audit-contract.mjs");
  assert.equal(assertStoreAlias({status:307,location:"/pricing"}),"HTTP_REDIRECT");
  assert.throws(()=>assertStoreAlias({status:302,location:"https://other.test/pricing"}),
    /PUBLIC_DATA_API_ALIAS_REDIRECT_MISMATCH/);
  const sha="a".repeat(40);
  const build={schema_version:"geomacro.deployment-build.v1",
    canonical_repository:"blocknine0/geomacro",canonical_main_sha:sha};
  assert.deepEqual(assertBuildMarker(build,sha),{website_sha:sha,exact_sha_checked:true});
  assert.throws(()=>assertBuildMarker(build,"b".repeat(40)),/PUBLIC_WEBSITE_EXACT_SHA_MISMATCH/);
  const audit=read("scripts/ops/verify-live-website-contract.mjs");
  assert.match(audit,/publicCapabilityPricingCatalog\(\)/);
  assert.match(audit,/assertStoreAlias/);
  assert.match(audit,/assertLockedStorefront/);
  assert.doesNotMatch(audit,/data-capability="[^"]*"\s*\+/);
  assert.doesNotMatch(audit,/price_variants:14/);
});

test("scheduled frontend acceptance covers all distinct public routes without writes", () => {
  const script=read("scripts/ops/check-frontend-public-deployment.py");
  assert.match(script,/PUBLIC_PAGE_CHECKS\s*=\s*\(/);
  for(const path of ["/intelligence","/risk-indices","/ask-geomacro","/docs",
    "/institutional","/contact","/research","/about","/roadmap",
    "/ecosystem","/risk-gate","/global-risk"]) {
    assert.ok(script.includes('"' + path + '"'),"missing outside-in route: " + path);
  }
  assert.match(script,/for path in PUBLIC_PAGE_CHECKS:/);
  assert.match(script,/record\["public_routes"\]\[path\]/);
  assert.match(script,/missing SSR heading or page title/);
  assert.doesNotMatch(script,/urllib\.request\.Request\([^)]*method="POST"/);
});

test("sitemap advertises canonical indexable risk pages, never redirect-only /data-api", () => {
  const sitemap=read("public/sitemap.xml");
  const locs=[...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match=>match[1]);
  assert.equal(new Set(locs).size,locs.length,"duplicate sitemap URL");
  assert.ok(locs.includes("https://geomacro.live/risk-indices"));
  assert.ok(locs.includes("https://geomacro.live/global-risk"));
  assert.ok(locs.includes("https://geomacro.live/pricing"));
  assert.ok(!locs.includes("https://geomacro.live/data-api"),
    "Redirect-only alias cannot be advertised as a canonical URL");
  for(const route of ["risk-indices","global-risk"]) {
    const page=read("src/routes/" + route + ".tsx");
    assert.match(page,/name: "robots", content: "index, follow/);
    assert.ok(page.includes('https://geomacro.live/' + route));
  }
  const approval=lock.approved_public_sitemap_canonical_20261106;
  assert.deepEqual(approval.approved_paths,["public/sitemap.xml"]);
  assert.equal(approval.exact_blob_lock,true);
  assert.equal(approval.payment_authorized,false);
  assert.equal(approval.global_risk_final_lock_unmodified,true);
  assert.match(lockVerifier,/approved_public_sitemap_canonical_20261106/);
});
