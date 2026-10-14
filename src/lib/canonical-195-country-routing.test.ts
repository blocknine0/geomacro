import {describe,it,expect,vi} from "vitest";
import {COUNTRIES_195,CANONICAL_195_VERSION,
  country195ByIso3,country195ByIso2} from "./canonical-country-registry-195";
import {buildCanonical195x3CoverageMatrix,COVERAGE_DOMAINS_195}
  from "./canonical-195-country-coverage-matrix";
import {classifyGlobalEntity} from "./global-entity-classification";
import {originalHeadlineMentionsCountry} from "./on-demand-original-subject-matching";
import {discoverOnDemandForPrivateQualification}
  from "./on-demand-global-discovery.server";

const clock=new Date("2026-10-14T12:00:00.000Z");
describe("195 UN-member + observer country routing against 250-entity legacy universe",()=>{
 it("pins exactly 193 UN members + Holy See and State of Palestine, unique alpha2/alpha3",()=>{
  expect(CANONICAL_195_VERSION).toBe("geomacro.un193-plus-two-observers.iso3.v1");
  expect(COUNTRIES_195).toHaveLength(195);
  expect(new Set(COUNTRIES_195.map(x=>x.iso3)).size).toBe(195);
  expect(new Set(COUNTRIES_195.map(x=>x.iso2)).size).toBe(195);
  expect(COUNTRIES_195.filter(x=>x.observer_state).map(x=>x.iso3).sort())
   .toEqual(["PSE","VAT"]);
  for(const c of COUNTRIES_195){
   expect(c.iso3).toMatch(/^[A-Z]{3}$/u);
   expect(c.iso2).toMatch(/^[A-Z]{2}$/u);
   expect(c.name.length).toBeGreaterThan(1);
   expect(country195ByIso3(c.iso3)).toBe(c);
   expect(country195ByIso2(c.iso2)).toBe(c);
   expect(["SOVEREIGN","SPECIAL_ENTITY"]).toContain(classifyGlobalEntity(c.iso3));
  }
  expect(country195ByIso3("TWN")).toBeNull(); // separate special entity
  expect(country195ByIso3("HKG")).toBeNull(); // separate territory
  expect(country195ByIso3("XYZ")).toBeNull();
  expect(classifyGlobalEntity("TWN")).toBe("SPECIAL_ENTITY");
  expect(classifyGlobalEntity("HKG")).toBe("TERRITORY");
 });
 it("makes exactly 585 independent tri-state cells; never fakes a live provider",()=>{
  const m=buildCanonical195x3CoverageMatrix();
  expect(m.country_count).toBe(195);
  expect(m.cell_count).toBe(585);
  expect(m.category_count).toBe(3);
  expect(m.cells).toHaveLength(585);
  for(const domain of COVERAGE_DOMAINS_195){
   expect(m.routing_verified_counts[domain]).toBe(195);
   expect(m.live_source_verified_counts[domain]).toBe(0);
   expect(m.current_evidence_verified_counts[domain]).toBe(0);
   expect(m.signed_delivery_verified_counts[domain]).toBe(0);
  }
  for(const c of m.cells){
   expect(c.ROUTING_VERIFIED).toBe(true);
   expect(c.LIVE_SOURCE_REACHABLE).toBeNull();
   expect(c.ORIGINAL_EVIDENCE_VERIFIED).toBeNull();
   expect(c.CURRENT_EVIDENCE_AVAILABLE).toBeNull();
   expect(c.RIGHTS_QUALIFIED).toBeNull();
   expect(c.SIGNED_DELIVERY_VERIFIED).toBeNull();
   expect(c.NO_CURRENT_EVIDENCE).toBeNull();
   expect(c.BLOCKED).toBe("PROVIDER_NOT_LIVE_PROBED");
  }
  expect(m.b2_requests).toBe(0);
  expect(m.supabase_requests).toBe(0);
  expect(m.x402_payment_authorized).toBe(false);
 });
 it("rejects fabricated evidence promotions and ambiguous country codes",()=>{
  expect(()=>buildCanonical195x3CoverageMatrix([{iso3:"ZZZ",category:"macro"}]))
   .toThrow("COUNTRY_195_COVERAGE_OBSERVATION_SCOPE_INVALID");
  expect(()=>buildCanonical195x3CoverageMatrix([
   {iso3:"PSE",category:"macro",current_evidence_available:true}]))
   .toThrow("COUNTRY_195_UNSUPPORTED_PROOF_PROMOTION");
  expect(()=>buildCanonical195x3CoverageMatrix([
   {iso3:"PSE",category:"macro",live_source_reachable:true,
     original_evidence_verified:true,current_evidence_available:true,
     rights_qualified:true,signed_delivery_verified:true,
     blocked_reason:"SOURCE_IDENTITY_UNRESOLVED"},
   {iso3:"PSE",category:"macro"}]))
   .toThrow("COUNTRY_195_DUPLICATE_COVERAGE_OBSERVATION");
  expect(()=>buildCanonical195x3CoverageMatrix([
   {iso3:"PSE",category:"macro",current_evidence_available:false,
     no_current_evidence:true,blocked_reason:"NO_CURRENT_QUALIFYING_EVENT"}]))
   .not.toThrow();
  expect(originalHeadlineMentionsCountry("Palestinian foreign-policy announcement",
    "PSE","State of Palestine")).toBe(true);
  expect(originalHeadlineMentionsCountry("Gaza ceasefire negotiations",
    "PSE","State of Palestine")).toBe(true);
  expect(originalHeadlineMentionsCountry("West Bank security update",
    "PSE","State of Palestine")).toBe(true);
  expect(originalHeadlineMentionsCountry("Ivory Coast election announcement",
    "CIV","Côte d'Ivoire")).toBe(true);
  expect(originalHeadlineMentionsCountry("Burma economic report",
    "MMR","Myanmar")).toBe(true);
  expect(originalHeadlineMentionsCountry("BurmaBay container news",
    "MMR","Myanmar")).toBe(false);
  expect(originalHeadlineMentionsCountry("Vatican City announces a decision",
    "VAT","Holy See")).toBe(true);
  expect(originalHeadlineMentionsCountry("South Korean policy release",
    "KOR","Korea, Rep.")).toBe(true);
  expect(originalHeadlineMentionsCountry("Chinatown policy release",
    "CHN","China")).toBe(false);
  expect(originalHeadlineMentionsCountry("Nigeria announcement",
    "NER","Niger")).toBe(false);
 });
 it("executes all 585 country-category routes through SAME bounded canonical engine with no network",async()=>{
  const requests:string[]=[];
  const fetchImpl=vi.fn(async (target:RequestInfo|URL):Promise<Response>=>{
    const url=new URL(String(target));
    requests.push(url.hostname);
    // Deliberately simulate no World Bank country record and inaccessible
    // structural data: country-name fallback must be from offline registry.
    if(url.hostname==="api.worldbank.org")return new Response("unavailable",{status:404});
    if(url.pathname.endsWith(".atom")||url.hostname==="api.io.canada.ca")
      return new Response("<feed></feed>",{headers:{"content-type":"application/atom+xml"}});
    if(url.hostname==="www.gov.uk" && url.pathname==="/api/search.json")
      return Response.json({results:[]});
    if(url.hostname==="www.federalreserve.gov"||
       url.hostname==="news.un.org"||url.hostname==="www.ecb.europa.eu"||
       url.hostname==="www.minister.industry.gov.au")
      return new Response("<rss><channel></channel></rss>",{
       headers:{"content-type":"application/rss+xml"}});
    throw Error("BLOCKED_UNKNOWN_OFFICIAL_HOST");
  }) as typeof fetch;
  const audited=new Set<string>();
  const inputs=COUNTRIES_195.flatMap(country=>
    COVERAGE_DOMAINS_195.map(category=>({country,category})));
  // Bounded fixture concurrency: no real external requests or 195x3 poller.
  for(let start=0;start<inputs.length;start+=15){
   const batch=inputs.slice(start,start+15);
   await Promise.all(batch.map(async({country,category})=>{
    const d=await discoverOnDemandForPrivateQualification({
      country_iso3:country.iso3,categories:[category],
      topics:[],max_age_seconds:86_400,
    },{fetchImpl,now:clock,disableDiscoveryIndex:true});
    expect(d.discovery.country_iso3).toBe(country.iso3);
    expect(d.private_verified_country_name).toBe(country.name);
    expect(d.private_original_review_candidates).toHaveLength(0);
    expect(d.discovery.payable).toBe(false);
    expect(d.discovery.network_attempts).toBeLessThanOrEqual(12);
    expect(d.discovery.b2_requests).toBe(0);
    expect(d.discovery.supabase_requests).toBe(0);
    audited.add(country.iso3+":"+category);
   }));
  }
  expect(audited.size).toBe(585);
  expect(requests.length).toBeGreaterThanOrEqual(585);
  expect(requests).not.toContain("example.com");
 },60_000);
});
