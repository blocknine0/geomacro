import {spawnSync} from "node:child_process";
import {runReliefWebPrivateD1} from "./reliefweb-private-d1.mjs";
import {deriveControlPlaneRootToken} from "../ops/derive-control-plane-root-token.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import {
  nativeSourceClock,privateTitleTopicHint,rssSourceCategory,
  rssSpoolPrivateCandidates,reliefwebPrivateCandidates,
  persistUnscoredSourceCandidatesD1,
} from "./private-unscored-source-d1.mjs";
import {validPrivateRawNews} from "../../workers/control-plane/src/phase2h-private-raw-news.mjs";

const now=new Date("2026-11-03T12:00:00.000Z");
const rss=(source_id,event_type,headline,source_url,published_at)=>({
  source_id,event_type,headline,source_url,published_at,
  source_record_id:source_url,verification_status:"UNVERIFIED",
});

test("native clocks preserve exact timezone and never fabricate retrieval time",()=>{
  assert.equal(nativeSourceClock("2026-11-03T11:00:00+00:00",now),
    "2026-11-03T11:00:00.000Z");
  assert.equal(nativeSourceClock("2026-11-02",now),"2026-11-02");
  for(const value of [undefined,"","2026-11-03T11:00:00",
    "2026-11-03T12:01:00Z","2026-10-01T11:00:00Z","feed_update",
    "2026-11-03T10:00:00+99:99"]){
    assert.equal(nativeSourceClock(value,now),null);
  }
});

test("title fallback classifies source candidates without inventing scores",()=>{
  assert.equal(privateTitleTopicHint("US critical mineral lithium supply review"),"rare_earth");
  assert.equal(privateTitleTopicHint("Central bank inflation report"),"macro");
  assert.equal(privateTitleTopicHint("Border ceasefire agreement"),"geopolitics");
  assert.equal(privateTitleTopicHint("Sports results"),null);
  assert.deepEqual(rssSourceCategory({event_type:"GEOPOLITICS_OFFICIAL_RELEASE",
    headline:"General meeting"}),{category:"geopolitics",basis:"publisher_source_event_type"});
});

test("independent minerals publishers remain private, with strict industry headline relevance",()=>{
  assert.deepEqual(rssSourceCategory({
    source_id:"doe_critical_materials_rss",
    event_type:"CRITICAL_MINERALS_GOVERNMENT_RELEASE",
    headline:"Critical materials supply chain assessment",
  }),{category:"rare_earth",basis:"publisher_source_event_type"});
  assert.equal(rssSourceCategory({
    source_id:"mining_com_critical_minerals_rss",
    event_type:"CRITICAL_MINERALS_INDUSTRY_REPORT",
    headline:"Gold miner shares jump after earnings call",
  }),null);
  assert.deepEqual(rssSourceCategory({
    source_id:"mining_com_critical_minerals_rss",
    event_type:"CRITICAL_MINERALS_INDUSTRY_REPORT",
    headline:"Lynas signs rare earth supply agreement",
  }),{category:"rare_earth",basis:"publisher_source_event_type"});
  assert.deepEqual(rssSourceCategory({
    source_id:"mining_com_critical_minerals_rss",
    event_type:"CRITICAL_MINERALS_INDUSTRY_REPORT",
    headline:"Copper mine adds downstream processing capacity",
  }),{category:"rare_earth",basis:"publisher_source_event_type"});
});

test("RSS private observation admission rejects unsafe and undated inputs",()=>{
  const rows=[
    rss("fed_press","MACRO_OFFICIAL_RELEASE","Federal Reserve monetary policy announcement",
      "https://www.federalreserve.gov/newsevents/pressreleases/monetary20261103a.htm",
      "2026-11-03T11:00:00Z"),
    rss("usgs_press","CRITICAL_MINERALS_BREAKING","Lithium mining project launches",
      "https://www.usgs.gov/news/some-minerals-release",
      "2026-11-03T10:00:00Z"),
    rss("news_wire","UNMAPPED","Military ceasefire announcement",
      "https://example.org/news/ceasefire","2026-11-03T09:00:00Z"),
    rss("fed_press","MACRO_OFFICIAL_RELEASE","Federal Reserve monetary policy announcement",
      "http://localhost/raw","2026-11-03T11:00:00Z"),
    rss("fed_press","MACRO_OFFICIAL_RELEASE","Federal Reserve monetary policy announcement",
      "https://www.federalreserve.gov/newsevents/pressreleases/missing-date.htm",
      null),
  ];
  const out=rssSpoolPrivateCandidates(rows,now);
  assert.deepEqual(out.candidates.map(x=>x.category),["macro","rare_earth","geopolitics"]);
  assert.equal(out.diagnostics.invalid,2);
  assert.equal(out.diagnostics.missing_native_publication,1);
  assert.equal(out.diagnostics.invalid_source_url,1);
  assert.equal(out.diagnostics.invalid_or_stale_publication,0);
  assert.equal(out.diagnostics.regex_only,1);
  assert.equal(out.candidates.every(x=>!Object.hasOwn(x,"severity")),true);
});

test("ReliefWeb report metadata only with native original dates and known catalogue URL",()=>{
  const good={id:100,fields:{title:"UN humanitarian displacement update",
    date:{original:"2026-11-03T08:00:00Z",created:"2026-11-03T10:00:00Z"},
    url:"https://reliefweb.int/report/example",country:[{iso3:"UKR"}]}};
  const noOriginal={id:101,fields:{...good.fields,
    url:"https://reliefweb.int/report/no-native",date:{created:"2026-11-03T10:00:00Z"}}};
  const unrelated={id:102,fields:{...good.fields,
    url:"https://third-party.example.com/article",date:{original:"2026-11-03T07:00:00Z"}}};
  const out=reliefwebPrivateCandidates([good,noOriginal,unrelated],now);
  assert.equal(out.candidates.length,1);
  assert.equal(out.diagnostics.invalid,2);
  assert.equal(out.candidates[0].sourceId,"reliefweb_v2_report_metadata");
});

test("private D1 uses exact canonical proof and never elevates commercial rights",async()=>{
  const url="https://www.federalreserve.gov/newsevents/pressreleases/monetary20261103a.htm";
  const {candidates}=rssSpoolPrivateCandidates([
    rss("fed_press","MACRO_OFFICIAL_RELEASE","Federal Reserve monetary policy announcement",url,
      "2026-11-03T11:00:00Z"),
    rss("fed_press","MACRO_OFFICIAL_RELEASE","Federal Reserve monetary policy announcement",url,
      "2026-11-03T11:00:00Z"),
  ],now);
  let called=0;
  const receipt=await persistUnscoredSourceCandidatesD1(candidates,{now,token:"fake-not-sent",
    post:async ({records,controlPlaneRoot})=>{
      called++;
      assert.equal(controlPlaneRoot,
        "https://geomacro-control-plane.daspallab202391.workers.dev");
      assert.equal(records.length,1);
      const item=records[0];
      assert.equal(item.category,"macro");
      assert.equal(item.original.original_article_license_verified,false);
      assert.equal(item.commercial_rights_verified,false);
      assert.equal(item.analysis.evidence_and_confidence.paid_eligible,false);
      assert.equal(item.analysis.what_happened.text,null);
      assert.equal(await validPrivateRawNews(item,now.getTime()),JSON.stringify(item));
      return {stored:1,duplicate:0,readback_verified:true,
        per_original_readback_verified:true,verified_originals:1};
    },
  });
  assert.equal(called,1);
  assert.equal(receipt.persisted,1);
  assert.equal(receipt.unscored,true);
  assert.equal(receipt.paid_eligible,false);
  await assert.rejects(
    persistUnscoredSourceCandidatesD1(candidates,{now,token:"fake-not-sent",
      post:async()=>({stored:1,duplicate:0,readback_verified:false,verified_originals:0})}),
    /PRIVATE_SOURCE_D1_EXACT_READBACK_UNVERIFIED/,
  );
});

test("one conflicting D1 identity cannot invalidate another original's readback",async()=>{
  const rows=[
    rss("official_a","MACRO_OFFICIAL_RELEASE","Central bank policy announcement",
      "https://example.com/official/a","2026-11-03T09:00:00Z"),
    rss("official_b","GEOPOLITICS_OFFICIAL_RELEASE","Border ceasefire announced",
      "https://example.com/official/b","2026-11-03T10:00:00Z"),
  ];
  const {candidates}=rssSpoolPrivateCandidates(rows,now);
  const saved=await persistUnscoredSourceCandidatesD1(candidates,{
    now,token:"fixture",post:async ({records})=>{
      assert.equal(records.length,2);
      return {stored:1,duplicate:0,rejected_conflicts:1,
        verified_originals:1,readback_verified:true,per_original_readback_verified:true};
    },
  });
  assert.equal(saved.persisted,1);
  assert.equal(saved.existing_identity_conflicts_quarantined,1);
  assert.equal(saved.identity_conflicts_quarantined,1);
  assert.equal(saved.d1_exact_readback_verified,true);
  assert.equal(saved.paid_eligible,false);
});

test("scheduled ReliefWeb D1 mode never imports retired Supabase client",()=>{
  const result=spawnSync(process.execPath,["scripts/ingest-reliefweb-live.mjs"],{
    encoding:"utf8",timeout:10000,
    env:{...process.env,RELIEFWEB_TRANSPORT:"d1_private",
      RELIEFWEB_APPROVED_APPNAME:"approved-fixture",
      GEOMACRO_COMMERCE_LEDGER_TOKEN:""},
  });
  assert.equal(result.status,1);
  assert.match(result.stderr,/RELIEFWEB_PRIVATE_D1_AUTH_REQUIRED/u);
  assert.doesNotMatch(result.stderr,/ERR_MODULE_NOT_FOUND|supabase-js/u);
});

test("ReliefWeb D1 writer uses existing HMAC-derived Control Plane token",async()=>{
  const root="q".repeat(40);
  let observed=false;
  const reply=await runReliefWebPrivateD1({
    env:{RELIEFWEB_APPROVED_APPNAME:"approved-fixture",
      GEOMACRO_COMMERCE_LEDGER_TOKEN:root,RELIEFWEB_MAX_REPORTS:"2"},
    now,
    fetchImpl:async url=>{
      assert.equal(new URL(url).searchParams.get("appname"),"approved-fixture");
      return Response.json({data:[{id:100,fields:{title:"UN humanitarian displacement update",
        date:{original:"2026-11-03T08:00:00Z"},
        url:"https://reliefweb.int/report/example"}}]});
    },
    persist:async (rows,options)=>{
      assert.equal(rows.length,1);
      assert.equal(options.token,deriveControlPlaneRootToken(root));
      assert.notEqual(options.token,root);
      observed=true;
      return {d1_exact_readback_verified:true,proposed:1,persisted:1,
        unchanged:0,existing_identity_conflicts_quarantined:0,
        identity_conflicts_quarantined:0};
    },
  });
  assert.equal(observed,true);
  assert.equal(reply.d1_records_written,1);
  assert.equal(reply.d1_exact_readback_verified,true);
});
