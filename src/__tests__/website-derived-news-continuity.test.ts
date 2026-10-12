import { readFileSync } from "node:fs";
import { deriveStatelessSignals } from "@/lib/stateless-intelligence-model";
import { describe, expect, it } from "vitest";
import {
  verifyDerivedStory, publishDerivedStories, readDerivedStories, renderDerivedStoriesHtml,
} from "../../workers/control-plane/src/website-derived-intelligence.mjs";

const NOW=Date.parse("2026-10-12T20:00:00.000Z");
const sample=(category="macro",published="2026-10-12T19:00:00.000Z")=>({
  id: category==="macro"?"macro-1234abcd":
    category==="geopolitics"?"geopolitics-1234abcd":"rare_earth-1234abcd",
  category,
  title:"Geomacro finds monetary policy on interest-rate policy",
  why_it_matters:"Monetary policy could affect currency and financing conditions, but direction is not inferred.",
  topic:"monetary policy",
  what_changed:"An official publisher issued a monetary policy update concerning interest-rate policy.",
  geography:null,
  development_type:"monetary policy",
  published_at:published,
  date_precision:"exact",
  observed_release_count:1,
  sources_credited:[],
  status:"official_release_observed_unscored",
  same_event_corrob_verified:false,
  severity:null,
});
function db() {
  const data=new Map();
  const statement=sql=>({
    async run(){ /* Direct zero-bind retention query; no rows past cap in fixture. */ },
    bind(...args) {
      return {
        async run() {
          if(sql.startsWith("INSERT OR IGNORE")) {
            const [id,category,published_at,date_precision,story_json,first_seen_at]=args;
            if(!data.has(id))data.set(id,{id,category,published_at,date_precision,story_json,first_seen_at});
          } else if(sql.startsWith("DELETE FROM website_derived_intelligence WHERE published_at")) {
            for(const [id,row] of data) if(row.published_at < args[0]) data.delete(id);
          } else if(sql.startsWith("DELETE FROM website_derived_intelligence WHERE id IN")) {
            const sorted=[...data.values()].sort((a,b)=>
              b.published_at.localeCompare(a.published_at)||b.id.localeCompare(a.id));
            for(const row of sorted.slice(600))data.delete(row.id);
          }
        },
        async all() {
          return {results:[...data.values()].sort((a,b)=>b.published_at.localeCompare(a.published_at))
            .slice(0,250).map(row=>({story_json:row.story_json}))};
        },
      };
    },
  });
  return {data,env:{DB:{prepare:statement,async batch(items){for(const item of items)await item.run()}}}};
}
describe("website-only Supabase-free derived news continuity",()=>{
  it("keeps real first-party UK trade source classification in sync with D1 publication allowlist",()=>{
    const candidates=[{
      sourceId:"uk_dbt_macro",category:"macro" as const,
      title:"India trade mission unlocks hundreds of UK jobs and new deals",
      articleUrl:"https://www.gov.uk/government/news/india-trade-mission-unlocks-hundreds-of-uk-jobs-and-new-deals",
      publishedAt:"2026-10-12T18:00:00.000Z",credit:null,
    }];
    const findings=deriveStatelessSignals(candidates,NOW);
    expect(findings).toHaveLength(1);
    expect(findings[0].topic).toBe("trade and economic relations");
    expect(verifyDerivedStory(findings[0],NOW)).toBe(true);
    expect(JSON.stringify(findings)).not.toContain("www.gov.uk");
  });
  it("admits the newly reviewed Macro/FX trade and economic relations derived topic",()=>{
    const story={...sample("macro"),
      topic:"trade and economic relations",
      title:"Geomacro finds agreement on international trade",
      what_changed:"An official publisher issued an agreement concerning international trade.",
      why_it_matters:"Trade policy and agreements may affect commercial flows, and exact impacts require separate evidence.",
      development_type:"agreement",
    };
    expect(verifyDerivedStory(story,NOW)).toBe(true);
    expect(verifyDerivedStory({...story,topic:"unreviewed fabricated claim"},NOW)).toBe(false);
  });

  it("admits old-but-original 30d publications and rejects 15m unreleased/future/historical",()=>{
    expect(verifyDerivedStory(sample(),NOW)).toBe(true);
    expect(verifyDerivedStory(sample("macro","2026-10-12T19:45:01.000Z"),NOW)).toBe(false);
    expect(verifyDerivedStory(sample("macro","2026-10-13T19:00:00.000Z"),NOW)).toBe(false);
    expect(verifyDerivedStory(sample("macro","2026-08-01T19:00:00.000Z"),NOW)).toBe(false);
  });
  it("rejects raw URLs, unreviewed claims and escalated signed/score fields",()=>{
    expect(verifyDerivedStory({...sample(),source_url:"https://secret.example.com"},NOW)).toBe(false);
    expect(verifyDerivedStory({...sample(),title:"Publisher exact headline"},NOW)).toBe(false);
    expect(verifyDerivedStory({...sample(),severity:63},NOW)).toBe(false);
    expect(verifyDerivedStory({...sample(),same_event_corrob_verified:true},NOW)).toBe(false);
    expect(verifyDerivedStory({...sample(),what_changed:"Official release https://publisher.example.com"},NOW)).toBe(false);
  });
  it("deduplicates on stable derived-only ID across scheduled runs and reads back",async()=>{
    const {data,env}=db(); const body={schema:"geomacro.website-derived-news-batch.v1",signals:[
      sample(),sample("geopolitics","2026-10-12T18:10:00.000Z"),
    ]};
    expect((await publishDerivedStories(env,body,NOW)).status).toBe(200);
    expect((await publishDerivedStories(env,body,NOW)).status).toBe(200);
    expect(data.size).toBe(2);
    const resp=await readDerivedStories(env,NOW);
    const result=await resp.json();
    expect(resp.status).toBe(200);
    expect(result.signals).toHaveLength(2);
    expect(result.signals[0].published_at).toBe("2026-10-12T19:00:00.000Z");
    expect(JSON.stringify(result)).not.toContain("source_url");
  });
  it("renders authentic D1-derived cards without React SSR and without upstream secrets", async()=>{
    const {env}=db();
    const b={schema:"geomacro.website-derived-news-batch.v1",
      signals:[sample("geopolitics","2026-10-12T18:40:00.000Z"),sample()]};
    expect((await publishDerivedStories(env,b,NOW)).status).toBe(200);
    const html=await renderDerivedStoriesHtml(env,NOW);
    const text=await html.text();
    expect(html.status).toBe(200);
    expect(html.headers.get("content-security-policy")).toContain("frame-ancestors https://geomacro.live");
    expect(text).toContain("Geomacro finds monetary policy on interest-rate policy");
    expect(text).toContain("What changed");
    expect(text).toContain("Why it matters");
    expect(text).not.toContain("source_url");
    expect(text).not.toContain("<script");
    expect(text).not.toContain("risk score");
    const locked=readFileSync("src/components/intelligence/stateless-live-desk.tsx","utf8");
    expect(locked).toContain("website-derived-news-html");
    expect(locked).toContain("allSignals.length === 0");
  });
  it("backfills from Oct 1 with original Content API first_published_at, never search update clock",()=>{
    const source=readFileSync("scripts/ops/backfill-website-derived-news.ts","utf8");
    const workflow=readFileSync(".github/workflows/website-news-gap-backfill.yml","utf8");
    expect(source).toContain('const START="2026-10-01"');
    expect(source).toContain('page.first_published_at');
    expect(source).toContain('originalPublicationMs(');
    expect(source).toContain('filter_public_timestamp');
    expect(source).toContain('first_published_at');
    expect(source).toContain('missing_originals_not_fabricated:true');
    expect(source).toContain('geomacro.backfill-independent-d1-readback.v1');
    expect(workflow).toContain('bun scripts/ops/backfill-website-derived-news.ts');
    expect(workflow).toContain('workflow_dispatch');
    expect(source).not.toContain('supabase.co');
  });
  it("passes the actual Signal[] from direct D1 read into server-rendered cards",()=>{
    const route=readFileSync("src/routes/intelligence.tsx","utf8");
    const desk=readFileSync("src/components/intelligence/stateless-live-desk.tsx","utf8");
    const fetcher=readFileSync("src/lib/public-derived-news-client.ts","utf8");
    expect(fetcher).toContain("Promise<StatelessIntelligenceSignal[]>");
    expect(route).toContain('fetchDirectDerivedNews()');
    expect(route).toContain('journal: history.status === "fulfilled" && Array.isArray(history.value)');
    expect(route).toContain('? history.value : []');
    expect(route).not.toContain("history.value.signals");
    expect(route).toContain('initialJournal={loader.journal}');
    expect(desk).toContain("useState<StatelessIntelligenceSignal[]>(() => initialJournal)");
    expect(desk).toContain("allSignals.length === 0");
    expect(desk).toContain("Reading the verified 30-day Intelligence journal below");
  });
  it("allows conservative day-only release only after its complete embargo",()=>{
    const day={...sample("rare_earth","2026-10-09"),date_precision:"day",
      title:"Geomacro finds critical-minerals policy on rare-earth materials",
      topic:"rare-earth supply",development_type:"policy update"};
    expect(verifyDerivedStory(day,Date.parse("2026-10-10T12:14:59.000Z"))).toBe(false);
    expect(verifyDerivedStory(day,Date.parse("2026-10-10T12:15:00.000Z"))).toBe(true);
  });
  it("free website journal is not a payment or B2 hot-snapshot promotion",()=>{
    const worker=readFileSync("workers/control-plane/src/website-derived-intelligence.mjs","utf8");
    const route=readFileSync("workers/control-plane/src/index.mjs","utf8");
    const cron=readFileSync(".github/workflows/website-derived-news-continuity.yml","utf8");
    const ui=readFileSync("src/components/intelligence/stateless-live-desk.tsx","utf8");
    expect(route).toContain('url.pathname === "/v1/public/website-derived-news"');
    expect(route).toContain('url.pathname === "/v1/website-derived-news"');
    expect(cron).toContain('cron: "7,37 * * * *"');
    expect(cron).toContain("bun scripts/ops/publish-website-derived-news.ts");
    expect(ui).toContain("getWebsiteDerivedNews()");
    expect(ui).toContain('const merged = new Map<string, StatelessIntelligenceSignal>()');
    expect(ui).toContain("Background collection every 30 minutes");
    for(const forbidden of ["https://supabase", "createPayment", "signed_risk_object",
      "publishB2VerifiedHotSnapshot", "fetch(", "localStorage"]) {
      expect(worker).not.toContain(forbidden);
    }
  });
});
