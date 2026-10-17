import {readFileSync} from "node:fs";
import {describe,it,expect} from "vitest";
import {deriveStatelessSignals,reconcilePrivateDerivedSourceRefs}
  from "../lib/stateless-intelligence-model";

const NOW=Date.parse("2026-10-14T12:00:00Z");
const original={
 sourceId:"fed_press",category:"macro" as const,
 title:"Federal Reserve announces discount rate monetary policy decision",
 articleUrl:"https://www.federalreserve.gov/newsevents/pressreleases/monetary20261013a.htm",
 publishedAt:"2026-10-13T18:00:00.000Z",credit:"Federal Reserve Board",
};
describe("ephemeral first-party original-reference crosswalk for D1-derived lead verification",()=>{
 it("reconstructs precise source identity only when the exact preexisting derived bytes agree",()=>{
  const [signal]=deriveStatelessSignals([original],NOW);
  expect(signal.id).toMatch(/^macro-[0-9a-f]{8}$/);
  const refs=reconcilePrivateDerivedSourceRefs([original],[signal],NOW);
  expect(refs.size).toBe(1);
  expect(refs.get(signal.id)?.articleUrl).toBe(original.articleUrl);
  // The free card still contains no upstream ID, headline or URL.
  expect(JSON.stringify(signal)).not.toContain(original.articleUrl);
  expect(JSON.stringify(signal)).not.toContain("fed_press");
  expect(JSON.stringify(signal)).not.toContain(original.title);
 });
 it("rejects a D1 derived row whose text, publisher identity or original clock was changed",()=>{
  const [signal]=deriveStatelessSignals([original],NOW);
  expect(reconcilePrivateDerivedSourceRefs([original],[{...signal,
    what_changed:"Changed after publication"}],NOW).size).toBe(0);
  expect(reconcilePrivateDerivedSourceRefs([original],[{...signal,
    published_at:"2026-10-14T11:55:00.000Z"}],NOW).size).toBe(0);
  expect(reconcilePrivateDerivedSourceRefs([{...original,
    articleUrl:"https://www.federalreserve.gov/newsevents/pressreleases/monetary20261014a.htm"}],
    [signal],NOW).size).toBe(0);
  expect(reconcilePrivateDerivedSourceRefs([{...original,
    sourceId:"other_press"}],[signal],NOW).size).toBe(0);
  expect(reconcilePrivateDerivedSourceRefs([original],[signal],NOW-31*86400_000).size).toBe(0);
 });
 it("does not add source references to public D1 or paid delivery by reusing original in memory",()=>{
  const worker=readFileSync("workers/control-plane/src/website-derived-intelligence.mjs","utf8");
  const publisher=readFileSync("scripts/ops/publish-website-derived-news.ts","utf8");
  expect(worker).toContain('const SIGNAL_KEYS = new Set(["id","category"');
  expect(worker).not.toContain("privateOriginals");
  expect(publisher).toContain("reconcilePrivateDerivedSourceRefs");
  expect(publisher).toContain("persisted_original_urls:false");
  expect(publisher).toContain("article_commercial_rights_verified:false");
  expect(publisher).toContain("customer_delivery_eligible:false");
  expect(publisher).toContain("UNAVAILABLE_NO_EVIDENCE_PROMOTION");
  expect(publisher).not.toContain("JSON.stringify(privateOriginals)");
  expect(publisher).not.toContain("signed:true");
 });
});
