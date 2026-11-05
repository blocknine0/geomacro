import {publicCapabilityPricingCatalog,GEOMACRO_CAPABILITY_PRICING_VERSION}
  from "../../src/lib/capability-pricing-catalog.ts";
import {GEOMACRO_SUBSCRIPTIONS,GEOMACRO_ONE_TIME_PACKS}
  from "../../src/lib/low-barrier-pricing.ts";
import {
  assertPublicPriceManifest,assertLockedStorefront,
  assertStoreAlias,assertRetiredGlobalRiskRedirect,assertBuildMarker,
} from "../lib/website-live-audit-contract.mjs";

const BASE = "https://geomacro.live";
const paths = ["/","/intelligence","/risk-indices","/ask-geomacro",
  "/institutional","/pricing","/contact","/about","/research",
  "/docs","/roadmap","/ecosystem"];
const LIMIT = 1_000_000;

async function read(path,accept="text/html") {
  const response = await fetch(BASE + path,{
    redirect:"error",
    signal:AbortSignal.timeout(20_000),
    headers:{Accept:accept},
  });
  if (response.status !== 200)
    throw Error("PUBLIC_ROUTE_UNHEALTHY:" + path + ":" + response.status);
  const body = await response.text();
  if (body.length > LIMIT) throw Error("PUBLIC_ROUTE_TOO_LARGE:" + path);
  return body;
}

async function verifyLegacyAlias() {
  const response = await fetch(BASE + "/data-api",{
    redirect:"manual",
    signal:AbortSignal.timeout(20_000),
    headers:{Accept:"text/html"},
  });
  const status = response.status;
  const location = response.headers.get("location");
  const html = status === 200 ? await response.text() : null;
  if (html && html.length > LIMIT) throw Error("PUBLIC_DATA_API_ALIAS_TOO_LARGE");
  try {
    return assertStoreAlias({status,location,html},BASE);
  } finally {
    if (status !== 200) {
      try { await response.body?.cancel(); } catch { /* no data retained */ }
    }
  }
}

async function verifyRetiredGlobalRisk() {
  const response = await fetch(BASE + "/global-risk",{
    redirect:"manual",
    signal:AbortSignal.timeout(20_000),
    headers:{Accept:"text/html"},
  });
  try {
    return assertRetiredGlobalRiskRedirect({
      status:response.status,
      location:response.headers.get("location"),
      robots:response.headers.get("x-robots-tag"),
    },BASE);
  } finally {
    try { await response.body?.cancel(); } catch { /* read only */ }
  }
}

async function main() {
  const pages = new Map();
  // Read-only, at most four document requests at once; never send Ask prompts,
  // payment requests, wallets, credentials or publisher fetches.
  for (let i = 0; i < paths.length; i += 4) {
    const batch = paths.slice(i,i+4);
    const results = await Promise.all(batch.map(async path => [path,await read(path)]));
    for (const [path,html] of results) {
      if (!/<h1\b/iu.test(html) || !/<title\b/iu.test(html))
        throw Error("PUBLIC_DOCUMENT_INCOMPLETE:" + path);
      pages.set(path,html);
    }
  }

  for (const path of ["/","/intelligence","/pricing"]) {
    if (!/href="\/"[^>]*>Home<\/a>/u.test(pages.get(path)))
      throw Error("PUBLIC_HOME_NAV_MISSING:" + path);
  }
  if (!/type="search"/u.test(pages.get("/intelligence")) ||
      !pages.get("/intelligence").includes("Filter by publication time"))
    throw Error("INTELLIGENCE_FILTERS_UNAVAILABLE");

  // The retired GRI read product is historical only. The public pricing API
  // exposes seven capabilities/twelve variants; never demand retired prices
  // or a deferred catalog on the founder-locked Store page.
  const expected = publicCapabilityPricingCatalog();
  const manifest = JSON.parse(await read("/api/v1/pricing","application/json"));
  const pricing = assertPublicPriceManifest(manifest,expected,GEOMACRO_CAPABILITY_PRICING_VERSION);
  const store = assertLockedStorefront(pages.get("/pricing"),
    GEOMACRO_SUBSCRIPTIONS,GEOMACRO_ONE_TIME_PACKS);
  const dataApiAlias = await verifyLegacyAlias();
  const retiredGlobalRisk = await verifyRetiredGlobalRisk();

  const build = JSON.parse(await read("/.well-known/geomacro-build.json","application/json"));
  const buildProof = assertBuildMarker(build,process.env.EXPECTED_SHA);
  console.log(JSON.stringify({
    schema:"geomacro.website-crosscheck.v2",
    public_documents_verified:paths.length,
    legacy_data_api_alias:dataApiAlias,
    retired_global_risk_redirect:retiredGlobalRisk,
    home_navigation_verified:true,
    intelligence_filters_verified:true,
    ...pricing,
    ...store,
    canonical_price_api_parity:true,
    per_call_store_catalog_required:false,
    ...buildProof,
    signed_deep_health_checked:false,
    merchant_settlement_checked:false,
    payments:0,
  }));
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : "WEBSITE_CROSSCHECK_FAILED");
  process.exitCode = 2;
});
