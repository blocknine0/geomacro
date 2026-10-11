import {describe,expect,it,vi} from "vitest";
import {classifyPrivateFirstPartyTitle} from "../../scripts/lib/private-first-party-title-triage.mjs";
import {observeUndatedFirstPartyAtomFeed} from "../../scripts/lib/private-undated-feed-observations.mjs";
import {reconcileUndatedPrivateFeedObservations} from "../../scripts/lib/private-undated-feed-dedup.mjs";
import {EXPANDED_OFFICIAL_SOURCES} from "../../scripts/ops/probe-expanded-official-source-mesh.mjs";
import {probe30MinThreeDomainPulse,select30MinPublishers} from "../../scripts/ops/probe-30min-three-domain-pulse.mjs";
import {write30MinSourcePulseToD1} from "../../scripts/ops/write-30min-source-pulse-d1.mjs";

const now=new Date("2026-10-11T19:00:00.000Z");
const s=(id:string)=>EXPANDED_OFFICIAL_SOURCES.find((x:{id:string})=>x.id===id)!;
const SOURCES=[
  s("uk_fcdo_original_foreign_policy_atom_review"),
  s("statcan_prices_original_atom_review"),
  s("nrcan_government_news_original_atom_review"),
];
const entries=[
  ["geopolitics","Foreign minister announces sanctions and diplomatic consultations"],
  ["macro","Statistics Canada reports new consumer price index developments"],
  ["rare_earth","Canada publishes critical mineral lithium supply assessment"],
] as const;
function observed(domain:string,title:string,id:string,at=now){
  const source=SOURCES.find(x=>x.domain===domain)!;
  const entry='<feed><entry><id>urn:geomacro-test:'+id+'</id>'+
    '<title>'+title+'</title><updated>2026-10-11T18:55:00Z</updated></entry></feed>';
  return observeUndatedFirstPartyAtomFeed(entry,source,{now:at});
}
describe("#2043 open intake → private topical hint without commercial gate",()=>{
  it("classifies source title ephemerally across all three domains, never converting hint to risk",()=>{
    for(const [domain,title] of entries){
      const x=classifyPrivateFirstPartyTitle(title,domain);
      expect(x.status).toBe("RELATED_UNVERIFIED");
      expect(x.topic_codes.length).toBeGreaterThan(0);
      expect(x.publication_clock_verified).toBe(false);
      expect(x.article_country_verified).toBe(false);
      expect(x.independent_event_verified).toBe(false);
      expect(x.commercial_rights_verified).toBe(false);
      expect(x.customer_delivery_eligible).toBe(false);
      const rows=observed(domain,title,"first");
      expect(rows).toHaveLength(1);
      expect(rows[0].private_relevance_triage).toMatchObject({
        status:"RELATED_UNVERIFIED",reason_code:"TOPIC_HINT_ONLY",
        customer_delivery_eligible:false,
      });
      expect(rows[0].publication_clock_status).toBe("UNKNOWN");
      expect(rows[0].article_category_relevance_verified).toBe(false);
      expect(rows[0].eligible_for_scoring).toBe(false);
      expect(JSON.stringify(rows)).not.toContain(title);
      expect(JSON.stringify(rows)).not.toContain("urn:geomacro-test:");
    }
  });
  it("captures unrelated/unreadable entries rather than blocking discovery",()=>{
    const unrelated=observed("geopolitics","New library exhibition opens in Cardiff","other");
    expect(unrelated).toHaveLength(1);
    expect(unrelated[0].private_relevance_triage.status).toBe("UNCLASSIFIED");
    const unreadable=observed("macro","<b>Release has HTML title</b>","unreadable");
    expect(unreadable).toHaveLength(1);
    expect(unreadable[0].private_relevance_triage.status).toBe("TITLE_UNREADABLE");
    expect(unreadable[0].private_relevance_triage.topic_codes).toEqual([]);
    expect(()=>classifyPrivateFirstPartyTitle("something","unknown")).toThrow();
  });
  it("baselines old feed entries and counts only actually new private hints",()=>{
    const first=observed("macro",entries[1][1],"old-1");
    const baseline=reconcileUndatedPrivateFeedObservations({
      domain:"macro",checkedAt:now.toISOString(),observations:first,
    });
    expect(baseline.initial_backlog_entries_baselined).toBe(1);
    expect(baseline.new_feed_entries_with_unverified_topic_hint).toBe(0);
    const later=new Date(now.getTime()+30*60*1000);
    const fresh=observed("macro",entries[1][1],"new-1",later);
    const oldAgain=observed("macro",entries[1][1],"old-1",later);
    const next=reconcileUndatedPrivateFeedObservations({
      domain:"macro",checkedAt:later.toISOString(),
      observations:[...fresh,...oldAgain],
      previousHistory:baseline.recent_private_undated_feed_fingerprints,
    });
    expect(next.new_feed_entries_since_previous_observation).toBe(1);
    expect(next.new_feed_entries_with_unverified_topic_hint).toBe(1);
    expect(next.existing_feed_entries_repeated).toBe(1);
    expect(next.semantic_relevance_qualified).toBe(false);
    expect(next.chargeable).toBe(false);
    expect(()=>reconcileUndatedPrivateFeedObservations({
      domain:"macro",checkedAt:now.toISOString(),
      observations:[{...first[0],private_relevance_triage:{
        ...first[0].private_relevance_triage,customer_delivery_eligible:true,
      }}],
    })).toThrow("UNDATED_PULSE_TRIAGE_UNTRUSTED");
  });
  it("writes only hash/count private D1 state for genuinely new macro hint, never title or payment",async()=>{
    const initial=now;
    // Align a 30m slot so selected official macro issuer includes StatCan.
    let at=initial;
    for(let i=0;i<6;i++){
      const nextAt=new Date(at.getTime()+30*60000);
      if(select30MinPublishers(at).macro.some(x=>x.id===SOURCES[1].id) &&
         select30MinPublishers(nextAt).macro.some(x=>x.id===SOURCES[1].id))break;
      at=nextAt;
    }
    const db=new Map<string,any>();
    const client=()=>({
      persist:async(domain:string,state:any,opts:any)=>{
        db.set(domain,{last_attempt_at:opts.last_attempt_at,payload:{...state}});
      },
      loadRows:async()=>db,
    });
    for(let i=0;i<2;i++){
      const clock=new Date(at.getTime()+i*30*60000);
      const list=observed("macro",entries[1][1],i===0?"older-item":"newer-item",clock);
      const pulse=await probe30MinThreeDomainPulse({
        now:clock,
        probe:async(source:{id:string;domain:string})=>({
          source_id:source.id,domain:source.domain,
          publisher_reachable:true,format_valid:true,
          original_publisher_topical_30m:0,original_publisher_topical_90m:0,
          original_publisher_topical_6h:0,source_native_7d_release_items:0,
          original_publisher_open_24h_count:0,private_original_article_candidates:[],
          private_undated_feed_observations:source.id===SOURCES[1].id?list:[],
          undated_observed_entry_count:source.id===SOURCES[1].id?1:0,
        }),
      });
      const readback=await write30MinSourcePulseToD1({
        report:pulse,createClient:client,
      });
      expect(readback.d1_readback_verified).toBe(true);
      expect(readback.payment_performed).toBe(false);
    }
    const state=db.get("macro").payload;
    expect(state.private_undated_feed_new_since_last_poll).toBe(1);
    expect(state.private_undated_feed_new_unverified_topic_hints).toBe(1);
    expect(state.undated_feed_publication_verified).toBe(false);
    expect(state.commercial_eligible).toBe(false);
    expect(JSON.stringify(db.get("macro"))).not.toContain("Statistics Canada reports");
    expect(JSON.stringify(db.get("macro"))).not.toContain("urn:geomacro-test");
  });
});
