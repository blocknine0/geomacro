import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  verifyDerivedStory, publishDerivedStories, readDerivedStories,
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
