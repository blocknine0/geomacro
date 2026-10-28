import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {
  refreshMaterializedNewsPages,getMaterializedNewsPage,
  getMaterializedNewsBundle
} from "../../workers/control-plane/src/materialized-public-news-pages.mjs";
import {
  readDerivedStories,readDerivedStoriesBundle
} from "../../workers/control-plane/src/website-derived-intelligence.mjs";

const clock=Date.parse("2026-10-27T10:00:00.000Z");
const migration=readFileSync(new URL(
  "../../workers/control-plane/migrations/0033_website_public_materialized_pages.sql",
  import.meta.url),"utf8");
function signal(id){
  const date=new Date(clock-(id+1)*1000).toISOString();
  return {id:"macro-"+id.toString(16).padStart(8,"0"),
    category:"macro",
    title:"Geomacro finds monetary policy on interest-rate policy",
    why_it_matters:"Monetary policy could affect currency and financing conditions, but direction is not inferred.",
    topic:"monetary policy",
    what_changed:"An official publisher issued a monetary policy update concerning interest-rate policy.",
    geography:null,development_type:"monetary policy",
    published_at:date,date_precision:"exact",observed_release_count:1,
    sources_credited:[],status:"official_release_observed_unscored",
    same_event_corrob_verified:false,severity:null};
}
function makeState(count=510){
  const sqlite=new DatabaseSync(":memory:");
  sqlite.exec("CREATE TABLE website_derived_intelligence (id TEXT PRIMARY KEY, category TEXT NOT NULL, published_at TEXT NOT NULL, date_precision TEXT NOT NULL,story_json TEXT NOT NULL,first_seen_at TEXT NOT NULL);");
  sqlite.exec(migration);
  const insert=sqlite.prepare("INSERT INTO website_derived_intelligence VALUES (?,?,?,?,?,?)");
  for(let i=0;i<count;i++){
    const s=signal(i);
    insert.run(s.id,s.category,s.published_at,s.date_precision,
      JSON.stringify(s),new Date(clock-500).toISOString());
  }
  let originReads=0,materializedBundleReads=0;
  let beforeBatch=()=>{};
  const env={DB:{
    prepare(sql){
      if(sql.includes("FROM website_derived_intelligence")&&
         sql.includes("SELECT story_json"))originReads++;
      if(sql.includes("SELECT p.page_offset,p.rows_json,p.generated_at"))materializedBundleReads++;
      const statement=sqlite.prepare(sql);
      const bound=(args=[])=>({
        async all(){return {results:statement.all(...args),success:true}},
        async first(){return statement.get(...args)??null},
        async run(){return {meta:statement.run(...args),success:true}},
        bind(...values){return bound(values)}
      });
      return bound();
    },
    async batch(stmts){
      beforeBatch();
      sqlite.exec("BEGIN IMMEDIATE");
      try{
        const result=[];
        for(const st of stmts)result.push(await st.run());
        sqlite.exec("COMMIT");return result;
      }catch(e){sqlite.exec("ROLLBACK");throw e}
    }
  }};
  return {env,sqlite,
    get originReads(){return originReads},
    get materializedBundleReads(){return materializedBundleReads},
    setBeforeBatch(fn){beforeBatch=fn}};
}

test("producer scans 510 canonical rows once; public pages read bounded indexed records",async()=>{
  const x=makeState();
  assert.equal(await getMaterializedNewsPage(x.env,0,clock),null);
  const receipt=await refreshMaterializedNewsPages(x.env,clock);
  assert.equal(receipt.status,"MATERIALIZED_COMMIT_VERIFIED");
  assert.equal(receipt.canonical_rows,510);
  const idempotent=await refreshMaterializedNewsPages(x.env,clock+2000);
  assert.equal(idempotent.status,"MATERIALIZED_ALREADY_CURRENT");
  const heldTwentyMinutes=await refreshMaterializedNewsPages(x.env,clock+20*60_000);
  assert.equal(heldTwentyMinutes.status,"MATERIALIZED_ALREADY_CURRENT");
  assert.equal(x.originReads,1,"nonchanged version cannot trigger another source scan");
  for(const minutes of [36,65,180,24*60]){
    const quiet=await refreshMaterializedNewsPages(x.env,clock+minutes*60_000);
    assert.equal(quiet.status,"MATERIALIZED_ALREADY_CURRENT");
  }
  assert.equal(x.originReads,1,"unchanged revisions do not rescan after old TTL or a missed backstop");
  assert.equal(x.originReads,1);
  const page=await getMaterializedNewsPage(x.env,0,clock);
  assert.equal(page.length,251);
  const last=await getMaterializedNewsPage(x.env,500,clock);
  assert.equal(last.length,10);
  // Quota-held backstop runs every 30 minutes; the public page remains
  // valid through minute 30 while source revisions remain unchanged.
  assert.notEqual(await getMaterializedNewsPage(x.env,0,clock+29*60_000),null);
  assert.notEqual(await getMaterializedNewsPage(x.env,0,clock+34*60_000),null);
  const beforeBundleReads=x.materializedBundleReads;
  const all=await getMaterializedNewsBundle(x.env,clock);
  assert.equal(all.length,510);
  assert.equal(x.materializedBundleReads,beforeBundleReads+1,
    "full public materialized bundle uses one D1 query, not three");
  assert.equal(x.originReads,1,"all page reads bypass the 251/601-row source SQL");
  const cached=await readDerivedStories(x.env,clock,0,0,true);
  assert.equal(cached.headers.get("X-GeoMacro-Public-Offload"),"d1-materialized");
  const view=await cached.json();
  assert.equal(view.signals.length,250);
  assert.equal(view.has_more,true);
  const machine=await (await readDerivedStoriesBundle(x.env,clock,true)).json();
  assert.equal(machine.signals.length,510);
  assert.equal(x.originReads,1);
  const origin=await readDerivedStories(x.env,clock,0,0,false);
  assert.equal(origin.headers.get("X-GeoMacro-Public-Offload"),null);
  const verified=await origin.json();
  assert.deepEqual(verified.signals.map(x=>x.id),view.signals.map(x=>x.id));
  assert.equal(x.originReads,2,"protected origin verification stays canonical");
  x.sqlite.close();
});

test('72h expiry happens before pagination and exactly matches canonical page metadata',async()=>{
 const x=makeState(600);
 const update=x.sqlite.prepare('UPDATE website_derived_intelligence SET published_at=?,story_json=?,first_seen_at=? WHERE id=?');
 for(let i=50;i<600;i++){
  const s=signal(i);
  const native=clock-72*60*60_000+60_000+(i-50)*1000;
  s.published_at=new Date(native).toISOString();
  update.run(s.published_at,JSON.stringify(s),new Date(i%2===0?native+1:clock-500).toISOString(),s.id);
 }
 await refreshMaterializedNewsPages(x.env,clock);
 const later=clock+15*60_000;
 const before=x.originReads;
 const rows=await getMaterializedNewsBundle(x.env,later);
 assert.equal(rows.length,325,'remove first-ingest expirations from the complete revision, before slicing');
 assert.equal(x.originReads,before);
 for(const offset of [0,250,500]){
  const cached=await (await readDerivedStories(x.env,later,offset,0,true)).json();
  const origin=await (await readDerivedStories(x.env,later,offset,0,false)).json();
  assert.deepEqual(cached,origin,'public page including has_more and original clocks matches canonical SQL');
 }
 const cached=await (await readDerivedStoriesBundle(x.env,later,true)).json();
 const origin=await (await readDerivedStoriesBundle(x.env,later,false)).json();
 assert.deepEqual(cached,origin);
 assert.equal(cached.signals.length,50,'native-expired releases cannot survive merely because the revision is unchanged');
 x.sqlite.close();
});

test('corrupt or future-dated matching snapshot is rejected and repaired by the owner refresh',async()=>{
 for(const corrupt of ["UPDATE website_derived_materialized_pages_v1 SET rows_json='broken' WHERE page_offset=0",
  "UPDATE website_derived_materialized_pages_v1 SET generated_at='2030-01-01T00:00:00.000Z'"]){
  const x=makeState(20);
  await refreshMaterializedNewsPages(x.env,clock);
  x.sqlite.exec(corrupt);
  assert.equal(await getMaterializedNewsBundle(x.env,clock+3600000),null);
  const receipt=await refreshMaterializedNewsPages(x.env,clock+3600000);
  assert.equal(receipt.status,'MATERIALIZED_COMMIT_VERIFIED');
  assert.equal(x.originReads,2,'only invalid snapshots cause an unchanged-revision repair scan');
  assert.equal((await getMaterializedNewsBundle(x.env,clock+3600000)).length,20);
  x.sqlite.close();
 }
});

test("every real insert/update/delete instantly invalidates snapshot with SQL triggers",async()=>{
  const x=makeState(15);
  await refreshMaterializedNewsPages(x.env,clock);
  assert.equal((await getMaterializedNewsPage(x.env,0,clock)).length,15);
  const revision=()=>x.sqlite.prepare(
    "SELECT data_revision FROM website_derived_materialized_meta_v1").get().data_revision;
  let prev=revision();
  const s=signal(90);
  x.sqlite.prepare("INSERT INTO website_derived_intelligence VALUES (?,?,?,?,?,?)")
    .run(s.id,s.category,s.published_at,s.date_precision,JSON.stringify(s),
       new Date(clock-100).toISOString());
  assert.equal(revision(),prev+1);
  assert.equal(await getMaterializedNewsPage(x.env,0,clock),null);
  const updated={...s,title:"Geomacro finds monetary policy on interest-rate decisions"};
  prev=revision();
  x.sqlite.prepare("UPDATE website_derived_intelligence SET story_json=? WHERE id=?")
    .run(JSON.stringify(updated),s.id);
  assert.equal(revision(),prev+1);
  x.sqlite.prepare("DELETE FROM website_derived_intelligence WHERE id=?").run(s.id);
  assert.equal(revision(),prev+2);
  const fallback=await (await readDerivedStories(x.env,clock,0,0,true)).json();
  assert.equal(fallback.signals.length,15);
  assert.ok(x.originReads>=2);
  await refreshMaterializedNewsPages(x.env,clock);
  assert.equal((await getMaterializedNewsPage(x.env,0,clock)).length,15);
  assert.notEqual(await getMaterializedNewsPage(x.env,0,clock+36*60_000),null);
  x.sqlite.close();
});

test("concurrent producer revision fences an overlapping materialization transaction",async()=>{
  const x=makeState(10);
  const added=signal(101);
  x.setBeforeBatch(()=>{
    x.sqlite.prepare("INSERT INTO website_derived_intelligence VALUES (?,?,?,?,?,?)")
      .run(added.id,added.category,added.published_at,added.date_precision,
         JSON.stringify(added),new Date(clock).toISOString());
    x.setBeforeBatch(()=>{});
  });
  const rejected=await refreshMaterializedNewsPages(x.env,clock);
  assert.equal(rejected.status,"MATERIALIZED_REVISION_RACE_HELD");
  assert.equal(await getMaterializedNewsPage(x.env,0,clock),null,
    "revision CAS cannot mark stale 10-item snapshot as current");
  await refreshMaterializedNewsPages(x.env,clock);
  assert.equal((await getMaterializedNewsPage(x.env,0,clock)).length,11);
  x.sqlite.close();
});

test("601-row untrimmed journal refuses cache publication instead of hiding overcap",async()=>{
  const x=makeState(601);
  await assert.rejects(refreshMaterializedNewsPages(x.env,clock),
    /MATERIALIZED_JOURNAL_OVER_CAP_OR_INVALID/);
  assert.equal(await getMaterializedNewsPage(x.env,0,clock),null);
  x.sqlite.close();
});

test("one-query materialized bundle rejects revision changes but ages out native rows without a scan",async()=>{
  const x=makeState(510);
  await refreshMaterializedNewsPages(x.env,clock);
  assert.equal((await getMaterializedNewsBundle(x.env,clock)).length,510);
  const reads=x.materializedBundleReads;
  const s=signal(900);
  x.sqlite.prepare("INSERT INTO website_derived_intelligence VALUES (?,?,?,?,?,?)")
    .run(s.id,s.category,s.published_at,s.date_precision,
      JSON.stringify(s),new Date(clock).toISOString());
  assert.equal(await getMaterializedNewsBundle(x.env,clock),null,
    "an intervening canonical write must invalidate the entire snapshot");
  assert.equal(x.materializedBundleReads,reads+1);
  await refreshMaterializedNewsPages(x.env,clock);
  assert.equal((await getMaterializedNewsBundle(x.env,clock)).length,511);
  assert.deepEqual(await getMaterializedNewsBundle(x.env,clock+73*60*60_000),[],
    "unchanged materialization expires all original rows without pretending they are fresh");
  x.sqlite.close();
});
