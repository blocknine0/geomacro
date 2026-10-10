import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { reconcile30mPrivateArticleFingerprints } from "../../scripts/lib/private-original-cross-poll-dedupe.mjs";
import { write30MinSourcePulseToD1 } from "../../scripts/ops/write-30min-source-pulse-d1.mjs";

const at = "2026-10-10T18:45:00.000Z";
const domains = ["geopolitics","macro","rare_earth"] as const;
const make = (domain:string, sha:string, publishedAt="2026-10-10T18:31:00.000Z")=>({
  schema:"geomacro.private-original-article-candidate.v1",
  domain,
  original_article_sha256:sha,
  headline_fingerprint_sha256:"f".repeat(64),
  native_published_at:publishedAt,
  read_transport_verified:true,
  original_article_content_verified:false,
  same_event_claim_identity_verified:false,
  independently_authored_reporting_verified:false,
  commercial_derived_use_rights_verified:false,
  eligible_for_scoring:false,
  eligible_for_publication:false,
});
function report(geoCandidates:unknown[],observed=at) {
  return {
    schema:"geomacro.private-three-domain-source-pulse-30m.v1",
    observed_at:observed,target_poll_minutes:30,
    source_catalog_entries_are_not_events:true,
    independently_verified_current_intelligence_count:0,
    publisher_rights_verified:false,
    b2_reads:0,b2_writes:0,d1_writes:0,supabase_requests:0,payments_performed:0,
    actual_original_publisher_rows:domains.map(domain=>({
      domain,checked_at:observed,status:"ORIGINAL_PUBLISHER_DATE_OBSERVED",
      original_publisher_30m_topic_count:domain==="geopolitics"?geoCandidates.length:0,
      private_original_article_candidates:domain==="geopolitics"?geoCandidates:[],
      publisher_pair_sample_complete:true,
      original_publishers_attempted:2,original_publishers_successful:2,
      chargeable_intelligence_ready:false,signed_current_gro_verified:false,
      commercial_rights_verified:false,
    })),
  };
}
describe("#1827 continuous 30m original article identity, private D1 only",()=>{
  it("same original URL SHA across successive runs is counted ONCE while distinct originals stay separate",()=>{
    const first=reconcile30mPrivateArticleFingerprints({
      domain:"geopolitics",checkedAt:at,
      candidates:[make("geopolitics","a".repeat(64)),make("geopolitics","a".repeat(64))],
    });
    expect(first.new_article_fingerprint_count).toBe(1);
    expect(first.repeated_article_fingerprint_count).toBe(1);
    const second=reconcile30mPrivateArticleFingerprints({
      domain:"geopolitics",checkedAt:"2026-10-10T19:15:00.000Z",
      previousHistory:first.recent_private_article_fingerprints,
      candidates:[make("geopolitics","a".repeat(64)),make("geopolitics","b".repeat(64))],
    });
    expect(second.new_article_fingerprint_count).toBe(1);
    expect(second.repeated_article_fingerprint_count).toBe(1);
    expect(second.tracked_article_fingerprint_count).toBe(2);
    expect(second.same_headline_cross_publisher_event_verified).toBe(false);
    expect(second.scored_intelligence_published).toBe(false);
  });

  it("keeps domain histories separate, does not dedup distinct URLs with identical headline hashes",()=>{
    const before=reconcile30mPrivateArticleFingerprints({
      domain:"macro",checkedAt:at,candidates:[make("macro","a".repeat(64))],
    });
    expect(()=>reconcile30mPrivateArticleFingerprints({
      domain:"rare_earth",checkedAt:at,
      previousHistory:before.recent_private_article_fingerprints,
      candidates:[make("rare_earth","b".repeat(64))],
    })).toThrow("SOURCE_PULSE_PREVIOUS_HISTORY_INVALID");
    const after=reconcile30mPrivateArticleFingerprints({
      domain:"rare_earth",checkedAt:at,
      candidates:[make("rare_earth","b".repeat(64))],
    });
    expect(after.new_article_fingerprint_count).toBe(1);
    expect(after.repeated_article_fingerprint_count).toBe(0);
    // History never acts as a same-event proof across category or publisher.
    expect(after.same_headline_cross_publisher_event_verified).toBe(false);
  });

  it("expires old private hash history without treating a source fetch time as an article date",()=>{
    const result=reconcile30mPrivateArticleFingerprints({
      domain:"geopolitics",checkedAt:at,
      previousHistory:[{
        domain:"geopolitics",article_sha256:"a".repeat(64),
        native_published_at:"2026-10-09T04:45:00.000Z",
      }],
      candidates:[make("geopolitics","b".repeat(64))],
    });
    expect(result.tracked_article_fingerprint_count).toBe(1);
    expect(result.newly_seen_private_article_refs).toEqual(["b".repeat(64)]);
  });

  it("rejects attempted commercial promotion, future/old native publication, tampered D1 history",()=>{
    const original=make("geopolitics","a".repeat(64));
    const bad=[
      {...original,eligible_for_publication:true},
      {...original,eligible_for_scoring:true},
      {...original,commercial_derived_use_rights_verified:true},
      {...original,original_article_sha256:"not-a-fingerprint"},
      {...original,native_published_at:"2026-10-10T19:00:00.000Z"},
      {...original,native_published_at:"2026-10-09T10:00:00.000Z"},
      {...original,domain:"macro"},
    ];
    for(const candidate of bad) {
      expect(()=>reconcile30mPrivateArticleFingerprints({
        domain:"geopolitics",checkedAt:at,candidates:[candidate],
      })).toThrow();
    }
    expect(()=>reconcile30mPrivateArticleFingerprints({
      domain:"geopolitics",checkedAt:at,previousHistory:"untrusted-string",
    })).toThrow();
    expect(()=>reconcile30mPrivateArticleFingerprints({
      domain:"geopolitics",checkedAt:at,previousHistory:[
        {domain:"geopolitics",article_sha256:"a".repeat(64),native_published_at:at},
        {domain:"geopolitics",article_sha256:"a".repeat(64),native_published_at:at},
      ],
    })).toThrow();
    expect(()=>reconcile30mPrivateArticleFingerprints({
      domain:"geopolitics",checkedAt:at,
      previousHistory:Array.from({length:241},(_,i)=>({
        domain:"geopolitics",article_sha256:i.toString(16).padStart(64,"0"),native_published_at:at,
      })),
    })).toThrow();
  });

  it("stores/reads back private SHA-only dedup across two real 3-domain D1 write cycles",async()=>{
    const rows=new Map<string,any>();
    const persist=vi.fn(async (domain:string,state:any,update:any)=>{
      rows.set(domain,{
        last_attempt_at:update.last_attempt_at,
        payload:{...state,cursor:state.cursor},
      });
    });
    const client=()=>({persist,loadRows:async()=>rows});
    const a=make("geopolitics","a".repeat(64));
    const b=make("geopolitics","b".repeat(64));
    const receipt1=await write30MinSourcePulseToD1({report:report([a]),
      createClient:client});
    expect(receipt1.new_private_original_article_fingerprints).toBe(1);
    expect(receipt1.repeated_private_original_article_fingerprints).toBe(0);
    const receipt2=await write30MinSourcePulseToD1({
      report:report([a,b],"2026-10-10T19:15:00.000Z"),
      createClient:client,
    });
    expect(receipt2.new_private_original_article_fingerprints).toBe(1);
    expect(receipt2.repeated_private_original_article_fingerprints).toBe(1);
    expect(rows.get("geopolitics").payload.recent_private_article_fingerprints).toHaveLength(2);
    expect(rows.get("geopolitics").payload.newly_seen_private_article_refs).toEqual(["b".repeat(64)]);
    expect(persist).toHaveBeenCalledTimes(6);
    expect(receipt2.original_article_identity_is_risk_event).toBe(false);
    expect(receipt2.source_current_scored_intelligence_verified).toBe(false);
    expect(receipt2.payment_performed).toBe(false);
  });

  it("makes fingerprints private, not part of public Worker GET, and never accesses B2/Supabase",()=>{
    const source=readFileSync("scripts/ops/write-30min-source-pulse-d1.mjs","utf8");
    const publicWorker=readFileSync("workers/control-plane/src/source-pulse-public.mjs","utf8");
    const flow=readFileSync(".github/workflows/three-domain-30m-original-publisher-pulse.yml","utf8");
    expect(source).toContain("reconcile30mPrivateArticleFingerprints");
    expect(source).toContain("recent_private_article_fingerprints");
    expect(publicWorker).not.toContain("recent_private_article_fingerprints");
    expect(publicWorker).not.toContain("newly_seen_private_article_refs");
    expect(flow).not.toContain("SUPABASE_DB_URL");
    expect(flow).not.toContain("B2_KEY_ID");
    expect(flow).not.toContain("GEOMACRO_COMMERCE_LEDGER_TOKEN");
  });
});
