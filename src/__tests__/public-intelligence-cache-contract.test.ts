import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("server/api/public/intelligence.get.ts", "utf8");

describe("public Intelligence freshness cache contract", () => {
  it("includes the live three-category journal and retains a cached verified legacy package", () => {
    expect(route).toContain("readWebsiteDerivedNews()");
    expect(route).toContain("derived_signals");
    expect(route).toContain("derived_categories");
    const reader=readFileSync("src/lib/public-derived-news-client.ts","utf8");
    expect(reader).toContain('s.status==="osint_feed_observed_unverified"');
    expect(route).toContain("INTELLIGENCE_UNAVAILABLE");
    expect(route).toContain("publicResponseCache");
  });

  it("SSR and browser hydration reuse the derived journal snapshot without an immediate duplicate read", () => {
    const page=readFileSync("src/routes/intelligence.tsx","utf8");
    const desk=readFileSync("src/components/intelligence/stateless-live-desk.tsx","utf8");
    expect(page).toContain("getWebsiteDerivedNews()");
    expect(page).toContain("history.value.signals");
    expect(desk).toContain('fetchAllDerivedNews(fetch,Date.now(),{fresh:false})');
    expect(desk).toContain("let skipHydratedRead = initialJournal.length > 0");
  });

  it("uses a 60 second public response cache, ETags, and a 304 without caching errors", () => {
    const cache=readFileSync("server/api/public/public-response-cache.server.ts","utf8");
    const worker=readFileSync("workers/control-plane/src/public-http-etag.mjs","utf8");
    expect(cache).toContain("public, max-age=60, stale-while-revalidate=300");
    expect(cache).toContain("if-none-match");
    expect(cache).toContain("setResponseStatus(event,304)");
    expect(cache).toContain("body as {ok?:unknown}).ok===true");
    expect(worker).toContain('new Response(null,{status:304,headers})');
  });

  it("keeps the self-certified Ed25519 projection on a distinct cached route without changing reviewed GRI", () => {
    const worker=readFileSync("workers/control-plane/src/index.mjs","utf8");
    const projection=readFileSync("workers/control-plane/src/geomacro-news-severity-gri.mjs","utf8");
    const reviewed=readFileSync("workers/control-plane/src/reviewed-risk-indices-delivery.mjs","utf8");
    expect(worker).toContain("serveSnapshotNewsSeverityGri");
    expect(worker).toContain("/v1/public/geomacro-news-severity-risk-indices");
    expect(projection).toContain("GEOMACRO_SELF_CERTIFIED_NEWS_SEVERITY_CALCULATION_ONLY");
    expect(projection).toContain("RISK_GATE_DECISION_ED25519_PRIVATE_KEY_PKCS8_B64");
    expect(projection).toContain("independent_third_party_certified:false");
    expect(reviewed).toContain("CURRENT_REVIEWED_SIGNED_THREE_INDICES_UNAVAILABLE");
  });
});
