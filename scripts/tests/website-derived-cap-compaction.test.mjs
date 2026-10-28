import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {compactDerivedJournalIfOverCap,WEBSITE_DERIVED_HARD_CAP}
  from "../../workers/control-plane/src/website-derived-cap-compaction.mjs";

const migration=readFileSync(new URL(
  "../../workers/control-plane/migrations/0033_website_public_materialized_pages.sql",
  import.meta.url),"utf8");
function setup(count){
  const sqlite=new DatabaseSync(":memory:");
  sqlite.exec("CREATE TABLE website_derived_intelligence (id TEXT PRIMARY KEY,"+
    "category TEXT,published_at TEXT,date_precision TEXT,"+
    "story_json TEXT,first_seen_at TEXT)");
  sqlite.exec(migration);
  const insert=sqlite.prepare(
    "INSERT INTO website_derived_intelligence VALUES(?,?,?,?,?,?)");
  for(let i=0;i<count;i++){
    const status=i===0?"official_release_observed_unscored":
      "osint_feed_observed_unverified";
    const story={status,topic:"monetary policy",
      what_changed:"A monitored source feed reports: an event."};
    insert.run("macro-"+i.toString(16).padStart(8,"0"),"macro",
      new Date(1793180000000+i*1000).toISOString(),"exact",
      JSON.stringify(story),"2026-10-28T00:00:00.000Z");
  }
  let countQueries=0,trimQueries=0;
  const db={
    prepare(sql){
      if(sql==="SELECT COUNT(*) AS journal_rows FROM website_derived_intelligence")
        countQueries++;
      if(sql.includes("json_extract(story_json"))trimQueries++;
      const stmt=sqlite.prepare(sql);
      return {async first(){return stmt.get()??null},
        async run(){stmt.run();return {success:true}}};
    }
  };
  return {sqlite,env:{DB:db},countQueries:()=>countQueries,trimQueries:()=>trimQueries};
}
test("quiet and full legal journal never executes old JSON ORDER BY or DELETE",async()=>{
  for(const rows of [0,250,599,600]){
    const x=setup(rows);
    const result=await compactDerivedJournalIfOverCap(x.env);
    assert.equal(result.state,"WITHIN_CAP");
    assert.equal(result.trim_executed,false);
    assert.equal(x.countQueries(),1);
    assert.equal(x.trimQueries(),0);
    assert.equal(x.sqlite.prepare("SELECT COUNT(*) AS n FROM website_derived_intelligence").get().n,rows);
    x.sqlite.close();
  }
});
test("actual 601+ canonical records are trimmed to 600 preserving original official priority and first-seen",async()=>{
  for(const count of [601,640]){
    const x=setup(count);
    const before=x.sqlite.prepare("SELECT first_seen_at FROM website_derived_intelligence WHERE id='macro-00000000'").get();
    const result=await compactDerivedJournalIfOverCap(x.env);
    assert.equal(result.state,"TRIMMED");
    assert.equal(result.trim_executed,true);
    assert.equal(x.countQueries(),2);
    assert.equal(x.trimQueries(),1);
    assert.equal(x.sqlite.prepare("SELECT COUNT(*) AS n FROM website_derived_intelligence").get().n,600);
    assert.deepEqual(x.sqlite.prepare("SELECT first_seen_at FROM website_derived_intelligence WHERE id='macro-00000000'").get(),before);
    const rev=x.sqlite.prepare("SELECT data_revision FROM website_derived_materialized_meta_v1").get();
    assert.equal(rev.data_revision,count+(count-600));
    x.sqlite.close();
  }
});
test("bad capacity counts and D1 errors fail closed, never declare safe",async()=>{
  for(const value of [null,-1,"600",600.5,NaN,Infinity,{}]){
    await assert.rejects(
      compactDerivedJournalIfOverCap({DB:{prepare:()=>({
        first:async()=>({journal_rows:value})
      })}}),
      /DERIVED_NEWS_CAP_COUNT_UNVERIFIED/);
  }
  await assert.rejects(compactDerivedJournalIfOverCap({}),
    /DERIVED_NEWS_CAP_DB_UNAVAILABLE/);
  const x=setup(601);
  const db={prepare(sql){
    if(sql.includes("json_extract"))return {run:async()=>({success:false})};
    return x.env.DB.prepare(sql);
  }};
  await assert.rejects(compactDerivedJournalIfOverCap({DB:db}),
    /DERIVED_NEWS_CAP_TRIM_UNAVAILABLE/);
  x.sqlite.close();
});
test("concurrent post-trim insert cannot produce a false successful cap receipt",async()=>{
  const x=setup(601);
  const original=x.env.DB;
  let reads=0;
  const db={prepare(sql){
    if(sql.startsWith("SELECT COUNT(*)")){
      reads++;
      if(reads===2){
        const insert=x.sqlite.prepare(
          "INSERT INTO website_derived_intelligence VALUES(?,?,?,?,?,?)");
        insert.run("macro-feedaaaa","macro","2026-10-28T05:00:00.000Z",
          "exact",'{"status":"osint_feed_observed_unverified"}',
          "2026-10-28T05:00:00.000Z");
      }
    }
    return original.prepare(sql);
  }};
  await assert.rejects(compactDerivedJournalIfOverCap({DB:db}),
    /DERIVED_NEWS_CAP_CONCURRENT_OVERFLOW/);
  assert.equal(reads,2);
  x.sqlite.close();
});
test("source integration compacts only on admitted empty sweep and never touches protected PREDGE",()=>{
  const source=readFileSync(new URL(
    "../../workers/control-plane/src/website-derived-intelligence.mjs",
    import.meta.url),"utf8");
  const block=source.slice(source.indexOf("if(body.signals.length===0){"),
    source.indexOf("return json({ok:true,schema:\"geomacro.website-derived-news-write-receipt",source.indexOf("if(body.signals.length===0){")));
  assert.match(block,/compactDerivedJournalIfOverCap\(env\)/u);
  assert.doesNotMatch(block,/ORDER BY\s*CASE\s*WHEN json_extract/u);
  assert.equal(WEBSITE_DERIVED_HARD_CAP,600);
});
