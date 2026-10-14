import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { reconcile30mPrivateArticleFingerprints } from "../../scripts/lib/private-original-cross-poll-dedupe.mjs";
import { reconcilePrivateOriginalReviewQueue } from "../../scripts/lib/private-original-review-queue.mjs";
import { write30MinSourcePulseToD1 } from "../../scripts/ops/write-30min-source-pulse-d1.mjs";
import {claimPrivateClassifierWork,acknowledgePrivateClassifierWork} from "../../scripts/lib/private-classifier-retry-ledger.mjs";

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

  it("retains 18h genuine original hashes across repeated polls: no recurring model/B2 costs",()=>{
    const nativeAt="2026-10-10T00:40:00.000Z";
    const candidate=make("macro","e".repeat(64),nativeAt);
    const first=reconcile30mPrivateArticleFingerprints({
      domain:"macro",checkedAt:at,candidates:[candidate],
    });
    expect(first.new_article_fingerprint_count).toBe(1);
    // A second poll must NOT score the 18h old item again.
    const second=reconcile30mPrivateArticleFingerprints({
      domain:"macro",checkedAt:"2026-10-10T19:15:00.000Z",
      candidates:[candidate],previousHistory:first.recent_private_article_fingerprints,
    });
    expect(second.repeated_article_fingerprint_count).toBe(1);
    expect(second.new_article_fingerprint_count).toBe(0);
    // History is kept past 24h to guard against later duplicate re-entry.
    const third=reconcile30mPrivateArticleFingerprints({
      domain:"macro",checkedAt:"2026-10-11T02:00:00.000Z",
      candidates:[],previousHistory:second.recent_private_article_fingerprints,
    });
    expect(third.tracked_article_fingerprint_count).toBe(1);
    const expired=reconcile30mPrivateArticleFingerprints({
      domain:"macro",checkedAt:"2026-10-11T07:00:00.000Z",
      candidates:[],previousHistory:third.recent_private_article_fingerprints,
    });
    expect(expired.tracked_article_fingerprint_count).toBe(0);
    expect(()=>reconcile30mPrivateArticleFingerprints({
      domain:"macro",checkedAt:"2026-10-11T02:00:00.000Z",
      candidates:[candidate],previousHistory:second.recent_private_article_fingerprints,
    })).toThrow("SOURCE_PULSE_UNSAFE_OR_UNDATED_CANDIDATE");
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


  it("routes only new original SHA hashes into non-commercial unverified review, no title or article body",()=>{
    const a={...make("geopolitics","a".repeat(64)),discovery_topic_matched:true};
    const b={...make("geopolitics","b".repeat(64)),discovery_topic_matched:false};
    const q=reconcilePrivateOriginalReviewQueue({
      domain:"geopolitics",checkedAt:at,candidates:[a,b],
      newArticleRefs:[a.original_article_sha256,b.original_article_sha256],
    });
    expect(q.newly_queued).toBe(2);
    expect(q.new_topic_hints_unverified).toBe(1);
    expect(q.awaiting_source_content_and_claim_review).toBe(2);
    expect(q.private_review_refs.map(x=>x.review_status)).toEqual(["UNVERIFIED","UNVERIFIED"]);
    expect(q.private_review_refs.map(x=>x.topic_hint).sort()).toEqual(
      ["NO_TOPIC_HINT","TOPIC_HINT_UNVERIFIED"]);
    expect(q.private_review_refs.every(x=>!x.payment_eligible&&!x.same_event_reviewed&&
      !x.country_verified&&!x.commodity_verified&&!x.commercial_rights_verified)).toBe(true);
    const serialized=JSON.stringify(q);
    for(const secret of ["article_url","article_title","raw_body","customer_query","source_id"])
      expect(serialized).not.toContain(secret);
    expect(q.signed_gro_created).toBe(false);
  });

  it("keeps pending source-native queue through repeated polling without retrying old articles",()=>{
    const a=make("macro","c".repeat(64));
    const first=reconcilePrivateOriginalReviewQueue({
      domain:"macro",checkedAt:at,candidates:[a],
      newArticleRefs:[a.original_article_sha256],
    });
    const again=reconcilePrivateOriginalReviewQueue({
      domain:"macro",checkedAt:"2026-10-10T19:15:00.000Z",
      candidates:[a],newArticleRefs:[],previousQueue:first.private_review_refs,
    });
    expect(again.newly_queued).toBe(0);
    expect(again.private_review_refs).toEqual(first.private_review_refs);
    const expired=reconcilePrivateOriginalReviewQueue({
      domain:"macro",checkedAt:"2026-10-11T19:00:00.000Z",
      candidates:[],newArticleRefs:[],previousQueue:again.private_review_refs,
    });
    expect(expired.awaiting_source_content_and_claim_review).toBe(0);
    expect(expired.private_review_refs).toEqual([]);
  });

  it("fails closed on unsafe source claims and tampered D1 review queue",()=>{
    const a=make("rare_earth","d".repeat(64));
    const init=reconcilePrivateOriginalReviewQueue({
      domain:"rare_earth",checkedAt:at,candidates:[a],
      newArticleRefs:[a.original_article_sha256],
    });
    const original=init.private_review_refs[0];
    for(const mutation of [
      {...original,review_status:"VERIFIED"},
      {...original,payment_eligible:true},
      {...original,commercial_rights_verified:true},
      {...original,raw_article_url:"https://untrusted.example/news"},
      {...original,source_as_of:"2026-10-10T18:50:00.000Z"},
      {...original,domain:"macro"},
      {...original,article_sha256:"BAD"},
    ]) {
      expect(()=>reconcilePrivateOriginalReviewQueue({
        domain:"rare_earth",checkedAt:"2026-10-10T19:15:00.000Z",
        previousQueue:[mutation],
      })).toThrow("PRIVATE_ORIGINAL_REVIEW_QUEUE_INVALID");
    }
    for(const modified of [
      {...a,eligible_for_scoring:true},
      {...a,article_category_relevance_verified:true},
      {...a,commercial_derived_use_rights_verified:true},
      {...a,native_published_at:"2026-10-11T18:31:00.000Z"},
    ]) {
      expect(()=>reconcilePrivateOriginalReviewQueue({
        domain:"rare_earth",checkedAt:at,
        candidates:[modified],newArticleRefs:[a.original_article_sha256],
      })).toThrow("PRIVATE_ORIGINAL_REVIEW_QUEUE_INVALID");
    }
    expect(()=>reconcilePrivateOriginalReviewQueue({
      domain:"rare_earth",checkedAt:at,candidates:[],newArticleRefs:["0".repeat(64)],
    })).toThrow("PRIVATE_ORIGINAL_REVIEW_QUEUE_INVALID");
    expect(()=>reconcilePrivateOriginalReviewQueue({
      domain:"rare_earth",checkedAt:at,candidates:[a],
      newArticleRefs:[a.original_article_sha256,a.original_article_sha256],
    })).toThrow("PRIVATE_ORIGINAL_REVIEW_QUEUE_INVALID");
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
    const liveQueue=rows.get("geopolitics").payload.private_original_review_refs;
    expect(liveQueue).toHaveLength(2);
    expect(liveQueue.every((x:any)=>x.review_status==="UNVERIFIED" &&
      x.intake_status==="OBSERVED" && x.payment_eligible===false)).toBe(true);
    expect(rows.get("geopolitics").payload.private_original_review_new_count).toBe(1);
    expect(rows.get("geopolitics").payload.private_original_review_pending_count).toBe(2);
    expect(receipt2.private_original_review_new_count).toBe(1);
    expect(receipt2.private_original_review_pending_count).toBe(2);
    expect(receipt2.private_original_claims_verified).toBe(false);
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
    expect(publicWorker).not.toContain("private_original_review_refs");
    expect(publicWorker).not.toContain("private_original_review_new_count");
    expect(flow).not.toContain("SUPABASE_DB_URL");
    expect(flow).not.toContain("B2_KEY_ID");
    expect(flow).not.toContain("GEOMACRO_COMMERCE_LEDGER_TOKEN");
  });
});


it("#2229 D1 producer can recover one failed original with readback, then suppress ACKed repeats",async()=>{
 const data=new Map<string,any>();
 const attempts=new Map<string,any>();
 const client=()=>({
   persist:async (domain:string,state:any,update:any)=>{
     data.set(domain,{last_attempt_at:update.last_attempt_at,
       payload:{...state,cursor:state.cursor}});
   },
   loadRows:async()=>data,
 });
 const attemptsClient=()=>({loadRows:async()=>attempts});
 const original=make("geopolitics","e".repeat(64));
 const first=await write30MinSourcePulseToD1({
   report:report([original]),createClient:client,
   createAttemptsClient:attemptsClient,
 });
 expect(first.selected_private_classifier_ref_count).toBe(1);
 expect(first.selected_private_classifier_retry_count).toBe(0);
 const sha=original.original_article_sha256;
 const claim=claimPrivateClassifierWork({domain:"geopolitics",ledger:null,
   work:{article_sha256:sha,native_published_at:original.native_published_at,
      next_attempts:1,retry:false},now:at,runId:"400"});
 attempts.set("geopolitics",{payload:claim});
 const second=await write30MinSourcePulseToD1({
   report:report([original],"2026-10-10T19:16:00.000Z"),
   createClient:client,createAttemptsClient:attemptsClient,
 });
 expect(second.new_private_original_article_fingerprints).toBe(0);
 expect(second.repeated_private_original_article_fingerprints).toBe(1);
 expect(second.selected_private_classifier_ref_count).toBe(1);
 expect(second.selected_private_classifier_retry_count).toBe(1);
 expect(data.get("geopolitics").payload.private_classifier_work_refs).toEqual([sha]);
 const retried=claimPrivateClassifierWork({domain:"geopolitics",
   ledger:attempts.get("geopolitics"),work:{article_sha256:sha,
     native_published_at:original.native_published_at,
     next_attempts:2,retry:true},now:"2026-10-10T19:16:00.000Z",runId:"401"});
 attempts.set("geopolitics",{payload:acknowledgePrivateClassifierWork({
   domain:"geopolitics",ledger:{payload:retried},
   now:"2026-10-10T19:16:00.000Z",runId:"401",
   attempted:[sha],returned:[sha],
 })});
 const third=await write30MinSourcePulseToD1({
   report:report([original],"2026-10-10T19:47:00.000Z"),
   createClient:client,createAttemptsClient:attemptsClient,
 });
 expect(third.selected_private_classifier_ref_count).toBe(0);
 expect(third.selected_private_classifier_retry_count).toBe(0);
 expect(third.new_private_original_article_fingerprints).toBe(0);
 expect(data.get("geopolitics").payload.private_classifier_work_refs).toEqual([]);
 expect(third.supabase_requests).toBe(0);
 expect(third.payment_performed).toBe(false);
});
