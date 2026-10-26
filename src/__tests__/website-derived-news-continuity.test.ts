import { readFileSync } from "node:fs";
import { deriveStatelessSignals } from "@/lib/stateless-intelligence-model";
import { describe, expect, it, vi } from "vitest";
import {
  verifyDerivedStory, publishDerivedStories, readDerivedStories, readDerivedStoriesBundle, renderDerivedStoriesHtml,
  DERIVED_NEWS_TOPIC_POLICY_REVISION,
} from "../../workers/control-plane/src/website-derived-intelligence.mjs";
import {classifyDerivedNewsD1Failure} from "../../scripts/lib/derived-news-d1-failure.mjs";

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
  const counters={upsertUpdateAttempts:0,storyJsonUpdates:0,retentionSweepQueries:0};
  const statement=sql=>({
    async run(){
      if(sql.startsWith("DELETE FROM website_derived_intelligence WHERE id IN"))
        counters.retentionSweepQueries++;
      /* Direct zero-bind retention query; no rows past cap in fixture. */
    },
    bind(...args) {
      return {
        async run() {
          if(sql.startsWith("INSERT INTO website_derived_intelligence")) {
            const [id,category,published_at,date_precision,story_json,first_seen_at]=args;
            const previous=data.get(id);
            if(!previous)data.set(id,{id,category,published_at,date_precision,story_json,first_seen_at});
            else if(previous.category===category && previous.published_at===published_at &&
              previous.date_precision===date_precision &&
              (!sql.includes("website_derived_intelligence.story_json <> excluded.story_json") ||
                previous.story_json!==story_json)) {
              counters.upsertUpdateAttempts++;
              if(previous.story_json!==story_json)counters.storyJsonUpdates++;
              previous.story_json=story_json;
            }
          } else if(sql.startsWith("DELETE FROM website_derived_intelligence WHERE published_at")) {
            counters.retentionSweepQueries++;
            for(const [id,row] of data) if(row.published_at < args[0] || row.first_seen_at < args[1]) data.delete(id);
          } else if(sql.startsWith("DELETE FROM website_derived_intelligence WHERE id IN")) {
            counters.retentionSweepQueries++;
            const sorted=[...data.values()].sort((a,b)=>
              b.published_at.localeCompare(a.published_at)||b.id.localeCompare(a.id));
            for(const row of sorted.slice(600))data.delete(row.id);
          }
        },
        async all() {
          return {results:[...data.values()].sort((a,b)=>b.published_at.localeCompare(a.published_at))
            .slice(0,250).map(row=>({story_json:row.story_json,first_seen_at:row.first_seen_at}))};
        },
      };
    },
  });
  return {data,counters,env:{DB:{prepare:statement,async batch(items){for(const item of items)await item.run()}}}};
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

  it("admits safe domain-only OSINT provenance and rejects a source URL/path",async()=>{
    expect(DERIVED_NEWS_TOPIC_POLICY_REVISION).toBe(2);
    const osint={...sample("macro"),topic:"official economic statistics",
      title:"Geomacro finds official economic statistics source-feed observation",
      what_changed:"A monitored source feed contains a dated item about official economic statistics. The event actor, precise action and impact have not been independently verified.",
      why_it_matters:"This observation can guide follow-up checks, but it does not establish a macroeconomic value, market move or verified consequence.",
      geography:null,development_type:"unverified OSINT feed observation",
      sources_credited:["Monitored feed: www.bankofcanada.ca"],
      status:"osint_feed_observed_unverified"};
    expect(verifyDerivedStory(osint,NOW)).toBe(true);
    expect(verifyDerivedStory({...osint,sources_credited:["Monitored feed: https://www.bankofcanada.ca"]},NOW)).toBe(false);
    expect(verifyDerivedStory({...osint,sources_credited:["Monitored feed: www.bankofcanada.ca/rss.xml"]},NOW)).toBe(false);
    expect(verifyDerivedStory({...osint,what_changed:"A report refers to www.bankofcanada.ca/rss.xml; no article proof exists."},NOW)).toBe(false);

    const {data,env}=db();
    const response=await publishDerivedStories(env,{schema:"geomacro.website-derived-news-batch.v1",signals:[osint]},NOW);
    expect(response.status).toBe(200);
    const feedResponse=await readDerivedStories(env,NOW);
    // This is a D1 journal readback/audit endpoint, not the public static archive.
    // Never cache its checked_at envelope: signed publisher acceptance must read fresh D1 state.
    expect(feedResponse.headers.get("Cache-Control")).toBe("no-store");
    const doc=await feedResponse.json();
    expect(doc.signals).toHaveLength(1);
    expect(doc.signals[0].sources_credited).toEqual(["Monitored feed: www.bankofcanada.ca"]);
    expect(data.size).toBe(1);
    const route=readFileSync("workers/control-plane/src/index.mjs","utf8");
    expect(route).toContain("derived_news_topic_policy_revision: DERIVED_NEWS_TOPIC_POLICY_REVISION");
  });

  it("reads the complete retained newsroom in one capped D1 query",async()=>{
    const {env}=db();
    const row=sample();
    expect((await publishDerivedStories(env,{
      schema:"geomacro.website-derived-news-batch.v1",signals:[row],
    },NOW)).status).toBe(200);
    const prepare=vi.spyOn(env.DB,"prepare");
    const response=await readDerivedStoriesBundle(env,NOW);
    expect(response.status).toBe(200);
    const bundle=await response.json();
    expect(bundle).toMatchObject({
      ok:true,schema:"geomacro.website-derived-news-bundle.v1",
      complete:true,item_cap:600,returned_rows:1,
      original_release_delay_minutes:0,retention_hours:72,chargeable:false,
    });
    expect(bundle.signals).toEqual([row]);
    expect(bundle.first_ingest).toHaveLength(1);
    expect(prepare).toHaveBeenCalledOnce();
    expect(prepare.mock.calls[0]?.[0]).toContain("LIMIT 601");
  });

  it("holds D1-heavy optional work on exhausted or unknown quota while the permanent archive still runs",()=>{
    const workflow=readFileSync(".github/workflows/website-derived-news-continuity.yml","utf8");
    const publisher=readFileSync("scripts/ops/publish-website-derived-news.ts","utf8");
    const archiveAt=workflow.indexOf('      - name: Publish append-only permanent Finds archive without D1 dependency');
    const readAt=workflow.indexOf('      - name: Read three domains and write only derived news to existing D1');
    expect(workflow).toContain("node scripts/ops/audit-d1-account-daily-quota-readonly.mjs");
    expect(workflow).toContain("D1_QUOTA_HEADROOM_HELD_PRESERVE_ARCHIVE_SKIP_D1_OPERATIONS");
    expect(workflow).toContain("steps.d1-quota.outputs.headroom == 'ready'");
    expect(archiveAt).toBeGreaterThan(readAt);
    const archiveStep=workflow.slice(archiveAt,workflow.indexOf("\n      - name:",archiveAt+10));
    expect(archiveStep).toContain("if: always() && github.event_name != 'pull_request' && github.ref == 'refs/heads/main'");
    expect(archiveStep).not.toContain("steps.d1-quota.outputs.headroom");
    expect(publisher).toContain('process.env.GEOMACRO_D1_QUOTA_HEADROOM==="held"');
    expect(publisher).toContain("D1_QUOTA_HEADROOM_HELD_STATIC_ARCHIVE_ONLY");
  });

  it("indexes the independent first-seen clock used by bounded retention cleanup",()=>{
    const migration=readFileSync(
      "workers/control-plane/migrations/0030_website_derived_first_seen_index.sql","utf8");
    expect(migration).toContain(
      "CREATE INDEX IF NOT EXISTS idx_website_derived_intelligence_first_seen");
    expect(migration).toContain("ON website_derived_intelligence (first_seen_at DESC)");
  });

  it("keeps a single empty batch as the only retention sweep and updates changed prose",async()=>{
    const {data,counters,env}=db();
    const first=sample();
    expect((await publishDerivedStories(env,{schema:"geomacro.website-derived-news-batch.v1",signals:[first]},NOW)).status).toBe(200);
    expect(counters.retentionSweepQueries).toBe(0);
    const revised={...first,what_changed:"An official publisher issued an updated monetary-policy statement about liquidity conditions."};
    expect((await publishDerivedStories(env,{schema:"geomacro.website-derived-news-batch.v1",signals:[revised]},NOW)).status).toBe(200);
    expect(counters.upsertUpdateAttempts).toBe(1);
    expect(counters.storyJsonUpdates).toBe(1);
    expect(counters.retentionSweepQueries).toBe(0);
    expect((await publishDerivedStories(env,{schema:"geomacro.website-derived-news-batch.v1",signals:[]},NOW)).status).toBe(200);
    expect(counters.retentionSweepQueries).toBe(2);
  });

  it("classifies the known D1 failure classes without exposing exception text",()=>{
    expect(classifyDerivedNewsD1Failure(new Error("Your account has exceeded D1's free tier daily row read limit. SQL details"))).toBe("D1_DAILY_ROW_READ_LIMIT");
    expect(classifyDerivedNewsD1Failure({message:"generic",cause:{message:"Your account has exceeded D1's free tier daily row write limit."}})).toBe("D1_DAILY_ROW_WRITE_LIMIT");
    expect(classifyDerivedNewsD1Failure(new Error("D1 DB is overloaded. Too many requests queued."))).toBe("D1_OVERLOADED");
    expect(classifyDerivedNewsD1Failure(new Error("Network connection lost."))).toBe("D1_TRANSIENT");
    expect(classifyDerivedNewsD1Failure(new Error("no such table: secret_table"))).toBe("D1_SCHEMA_OR_SQL");
    expect(classifyDerivedNewsD1Failure(new Error("some unrecognized query text"))).toBe("D1_UNCLASSIFIED");
  });

  it("returns an allowlisted D1 failure class and never logs raw database exceptions",async()=>{
    const writeError=new Error("Your account has exceeded D1's free tier daily row write limit. raw query secret");
    const writeEnv={DB:{
      prepare(){return {bind(){return {run:async()=>{throw writeError},all:async()=>{throw writeError}}}}},
      batch:async()=>{throw writeError},
    }};
    const log=vi.spyOn(console,"error").mockImplementation(()=>{});
    try{
      const written=await publishDerivedStories(writeEnv,{
        schema:"geomacro.website-derived-news-batch.v1",signals:[sample()],
      },NOW);
      const writeReceipt=await written.json();
      expect(written.status).toBe(503);
      expect(writeReceipt.diagnostic_code).toBe("D1_DAILY_ROW_WRITE_LIMIT");
      expect(log.mock.calls.flat().join(" ")).not.toContain("raw query secret");
      const readError=new Error("Your account has exceeded D1's free tier daily row read limit. private SQL");
      const readEnv={DB:{prepare:()=>({bind:()=>({
        all:async()=>{throw readError;},
      })})}};
      const read=await readDerivedStories(readEnv,NOW);
      const readReceipt=await read.json();
      expect(read.status).toBe(503);
      expect(readReceipt.diagnostic_code).toBe("D1_DAILY_ROW_READ_LIMIT");
      expect(log.mock.calls.flat().join(" ")).not.toContain("private SQL");
    }finally{log.mockRestore();}
  });

  it("admits old-but-original 30d publications and rejects future/historical",()=>{
    expect(verifyDerivedStory(sample(),NOW)).toBe(true);
    expect(verifyDerivedStory(sample("macro","2026-10-12T19:45:01.000Z"),NOW)).toBe(true);
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
    const {data,counters,env}=db(); const body={schema:"geomacro.website-derived-news-batch.v1",signals:[
      sample(),sample("geopolitics","2026-10-12T18:10:00.000Z"),
    ]};
    expect((await publishDerivedStories(env,body,NOW)).status).toBe(200);
    expect((await publishDerivedStories(env,body,NOW)).status).toBe(200);
    expect(data.size).toBe(2);
    // An identical retained card must not consume another D1 row write, and
    // normal non-empty batches no longer run the two full-journal sweep queries.
    expect(counters.upsertUpdateAttempts).toBe(0);
    expect(counters.storyJsonUpdates).toBe(0);
    expect(counters.retentionSweepQueries).toBe(0);
    const resp=await readDerivedStories(env,NOW);
    const result=await resp.json();
    expect(resp.status).toBe(200);
    expect(result.signals).toHaveLength(2);
    expect(result.ingest_clock_kind).toBe("D1_FIRST_INSERT_NOT_WEBSITE_FIRST_RENDER");
    expect(result.first_ingest).toHaveLength(2);
    expect(result.first_ingest.every((v:{first_seen_at:string})=>
      v.first_seen_at==="2026-10-12T20:00:00.000Z")).toBe(true);
    expect(result.signals[0].published_at).toBe("2026-10-12T19:00:00.000Z");
    expect(JSON.stringify(result)).not.toContain("source_url");
  });
  it("does not publish >72h originals, and evicts older original or ingest times on empty hourly sweep",async()=>{
    const {data,env}=db();
    const old=sample("macro","2026-10-09T19:59:59.000Z");
    expect((await publishDerivedStories(env,{
      schema:"geomacro.website-derived-news-batch.v1",signals:[old],
    },NOW)).status).toBe(400);
    const fresh=sample();
    expect((await publishDerivedStories(env,{
      schema:"geomacro.website-derived-news-batch.v1",signals:[fresh],
    },NOW)).status).toBe(200);
    const before=await (await readDerivedStories(env,NOW)).json();
    expect(before.retention_hours).toBe(72);
    expect(before.retention_days).toBe(3);
    expect(before.signals).toHaveLength(1);
    // Publication is still within 72h at +71h, but first ingestion has aged
    // 72h 1min: the scheduled empty batch MUST physically evict the record.
    const next=NOW+72*60*60_000+60_000;
    expect((await publishDerivedStories(env,{
      schema:"geomacro.website-derived-news-batch.v1",signals:[],
    },next)).status).toBe(200);
    expect(data.size).toBe(0);
    expect((await (await readDerivedStories(env,next)).json()).signals).toHaveLength(0);
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
    expect(text).toContain("monetary policy on interest-rate policy");
    expect(text).toContain("Country or region: Not specified in the release");
    expect(text).not.toContain("\u2014");
    expect(text).toContain("What changed");
    expect(text).toContain("Why it matters");
    expect(text).not.toContain("source_url");
    expect(text).not.toContain("<script");
    expect(text).not.toContain("risk score");
    const locked=readFileSync("src/components/intelligence/stateless-live-desk.tsx","utf8");
    expect(locked).not.toContain("website-derived-news-html");
    expect(locked).toContain("isConcretePublicIntelligence");
    expect(locked).toContain("allSignals.length === 0");
  });
  it("backfills across rolling 72 hours by verified original Content API first_published_at, never search update clock",()=>{
    const source=readFileSync("scripts/ops/backfill-website-derived-news.ts","utf8");
    const workflow=readFileSync(".github/workflows/website-news-gap-backfill.yml","utf8");
    expect(source).toContain("const START=new Date(TODAY-3*DAY_MS)");
    expect(source).toContain("ms+=7*DAY_MS");
    expect(source).toContain("sourceWindows.push");
    expect(source).toContain("search_pages_checked");
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
    expect(desk).toContain("Checking for concrete news developments");
  });
  it("allows conservative day-only release only after its complete embargo",()=>{
    const day={...sample("rare_earth","2026-10-09"),date_precision:"day",
      title:"Geomacro finds critical-minerals policy on rare-earth materials",
      topic:"rare-earth supply",development_type:"policy update"};
    expect(verifyDerivedStory(day,Date.parse("2026-10-10T11:59:59.000Z"))).toBe(false);
    expect(verifyDerivedStory(day,Date.parse("2026-10-10T12:00:00.000Z"))).toBe(true);
  });
  it("preserves actual verified StatCan first-party DAY into the D1-only Macro projection",()=>{
    const now=Date.parse("2026-10-13T12:00:00Z");
    const candidate={
      sourceId:"statcan_prices",category:"macro" as const,
      title:"Canada Consumer Price Index for September 2026",
      articleUrl:"https://www150.statcan.gc.ca/n1/daily-quotidien/261012/dq261012a-eng.htm",
      publishedAt:"2026-10-12",datePrecision:"day" as const,
      credit:"Statistics Canada",
    };
    const derived=deriveStatelessSignals([candidate],now);
    expect(derived).toHaveLength(1);
    expect(derived[0].date_precision).toBe("day");
    expect(derived[0].category).toBe("macro");
    expect(verifyDerivedStory(derived[0],now)).toBe(true);
    expect(JSON.stringify(derived)).not.toContain(candidate.articleUrl);
    expect(JSON.stringify(derived)).not.toContain(candidate.title);
    expect(derived[0].severity).toBeNull();
    expect(derived[0].same_event_corrob_verified).toBe(false);
  });

  it.each(["geopolitics","macro","rare_earth"])("admits only genuinely original day-only %s after next-day 12:00 UTC",category=>{
    const day={...sample(category,"2026-10-12"),date_precision:"day",
      topic:category==="macro"?"official economic statistics":category==="rare_earth"?"rare-earth supply":"foreign policy"};
    const early=Date.parse("2026-10-13T11:59:59Z");
    const eligible=Date.parse("2026-10-13T12:00:00Z");
    expect(verifyDerivedStory(day,early)).toBe(false);
    expect(verifyDerivedStory(day,eligible)).toBe(true);
    for (const invalid of ["2026-02-30","2026-10-12T12:00:00Z","2026-10-14"]) {
      expect(verifyDerivedStory({...day,published_at:invalid},eligible)).toBe(false);
    }
    expect(verifyDerivedStory({...day,severity:52},eligible)).toBe(false);
    expect(verifyDerivedStory({...day,same_event_corrob_verified:true},eligible)).toBe(false);
  });
  it("accepts originally day-dated Stats Canada Macro into private derived-only D1, never paid score",async()=>{
    const now=Date.parse("2026-10-13T12:00:00Z");
    const day={...sample("macro","2026-10-12"),date_precision:"day",
      topic:"official economic statistics",title:"Geomacro finds official economic statistics on labour-market developments"};
    const {data,env}=db();
    const response=await publishDerivedStories(env,{schema:"geomacro.website-derived-news-batch.v1",
      signals:[day]},now);
    expect(response.status).toBe(200);
    expect(data.size).toBe(1);
    const read=await readDerivedStories(env,now);
    const doc=await read.json();
    expect(read.status).toBe(200);
    expect(doc.signals).toHaveLength(1);
    expect(doc.signals[0].published_at).toBe("2026-10-12");
    expect(doc.scored).toBe(false);
    expect(doc.chargeable).toBe(false);
    expect(JSON.stringify(doc)).not.toContain("source_url");
  });

  it("serves just-published originals immediately while preserving already deployed legacy browsers",async()=>{
    const {env}=db();
    const recent=sample("macro",new Date(NOW-60_000).toISOString());
    const old=sample("geopolitics");
    expect((await publishDerivedStories(env,{schema:"geomacro.website-derived-news-batch.v1",signals:[recent,old]},NOW)).status).toBe(200);
    const current=await (await readDerivedStories(env,NOW)).json();
    expect(current.original_release_delay_minutes).toBe(0);
    expect(current.signals).toHaveLength(2);
    const legacy=await (await readDerivedStories(env,NOW,0,15)).json();
    expect(legacy.original_release_delay_minutes).toBe(15);
    expect(legacy.signals).toHaveLength(1);
    expect(legacy.signals[0].id).toBe(old.id);
    expect((await readDerivedStories(env,NOW,0,1)).status).toBe(400);
  });

  it("free website journal is not a payment or B2 hot-snapshot promotion",()=>{
    const worker=readFileSync("workers/control-plane/src/website-derived-intelligence.mjs","utf8");
    const route=readFileSync("workers/control-plane/src/index.mjs","utf8");
    const cron=readFileSync(".github/workflows/website-derived-news-continuity.yml","utf8");
    const ui=readFileSync("src/components/intelligence/stateless-live-desk.tsx","utf8");
    expect(route).toContain('"/v1/public/website-derived-news-immediate"');
    expect(route).toContain('url.pathname === "/v1/website-derived-news"');
    expect(cron).toContain('cron: "7 * * * *"');
    expect(cron).toContain("bun scripts/ops/publish-website-derived-news.ts");
    expect(ui).toContain("fetchPermanentDerivedNews()");
    expect(ui).toContain("fetchDirectDerivedNews()");
    expect(ui).not.toContain("getWebsiteDerivedNews");
    expect(ui).not.toContain("fetchAllDerivedNews()");
    expect(ui).toContain("const merged = new Map(previous.map(signal => [signal.id, signal]));");
    // Presentation copy is locked to the approved published website baseline until separately published.
    expect(ui).toContain("isConcretePublicIntelligence");
    expect(ui).not.toContain("SOURCE / PUBLISHER");
    for(const forbidden of ["https://supabase", "createPayment", "signed_risk_object",
      "publishB2VerifiedHotSnapshot", "fetch(", "localStorage"]) {
      expect(worker).not.toContain(forbidden);
    }
  });
});
