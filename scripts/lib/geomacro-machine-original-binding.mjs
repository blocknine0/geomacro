import {createHash} from "node:crypto";
import {evaluateGeomacroMachineCorroboration} from "./geomacro-machine-corroboration.mjs";
import {verifyGeomacroOriginalPages} from "./geomacro-original-page-readback.mjs";

/**
 * PRIVATE automatic original-source continuation for issue #2044.
 * Independently re-reads each first-party article using the established
 * pinned HTTPS issuer/path and source-native publication verifier. A URL
 * identity SHA from a legacy feed is NEVER promoted as article body evidence.
 *
 * The result remains a PRIVATE, no-funds source-corroboration candidate,
 * NOT a semantic fact checker, source-licence approval or paid GRO.
 */
const HASH=/^[a-f0-9]{64}$/u;
const MAX=4;
const fail=()=>{throw Error("GEOMACRO_MACHINE_ORIGINAL_BINDING_REJECTED")};
const digest=v=>createHash("sha256").update(JSON.stringify(v)).digest("hex");
/** @param {{candidates?: unknown[], now?: Date, fetchImpl?: typeof fetch}} [options] */
export async function verifyGeomacroTwoOriginalMachineBinding({
  candidates,now=new Date(),fetchImpl=fetch,
}={}){
  if(!Array.isArray(candidates)||candidates.length<2||
     candidates.length>MAX||!Number.isFinite(now?.getTime?.()))
    fail();
  let report;
  try{report=evaluateGeomacroMachineCorroboration({candidates,now})}
  catch{fail()}
  if(report.multiple_original_machine_candidates!==1||
     report.original_claim_count!==1||report.claims?.length!==1||
     report.claims[0].candidate_status!=="TWO_ORIGINAL_MACHINE_MATCH_REQUIRES_SOURCE_AUDIT"||
     report.candidate_count!==candidates.length ||
     report.claims[0].independent_original_issuer_count!==candidates.length||
     report.claims[0].confirming_original_issuer_count!==candidates.length||
     report.claims[0].distinct_original_content_count!==candidates.length||
     candidates.some(c=>c.reporting_position!=="confirms"||
       !HASH.test(c.original_article_sha256)||
       c.category!==report.claims[0].category||
       c.same_event_claim_sha256!==report.claims[0].event_claim_sha256))
    fail();
  const originals=candidates.map(c=>({
    category:c.category,
    same_event_claim_sha256:c.same_event_claim_sha256,
    originating_reporting_organization_id:c.originating_reporting_organization_id,
    original_article_url:c.original_article_url,
    original_published_at:c.original_published_at,
    reporting_position:c.reporting_position,
    // This input is a reviewed HTML **byte** digest, not the URL fingerprint
    // from legacy private original publisher observation.
    expected_html_sha256:c.original_article_sha256,
  }));
  let pages;
  try{pages=await verifyGeomacroOriginalPages({originals,now,fetchImpl})}
  catch{fail()}
  if(pages.schema!=="geomacro.private-two-original-page-readback.v1"||
     pages.checked_original_count!==candidates.length||
     pages.verified_original_count!==candidates.length||
     pages.original_pages_authenticity_and_clock_verified!==true||
     pages.same_event_claim_sha256!==report.claims[0].event_claim_sha256||
     pages.category!==report.claims[0].category||
     pages.results.length!==candidates.length ||
     pages.results.some((r,i)=>r.status!=="PAGE_BYTES_AND_NATIVE_CLOCK_VERIFIED"||
       r.article_sha256!==candidates[i].original_article_sha256||
       !Number.isFinite(Date.parse(r.original_published_at))||
       Math.abs(Date.parse(r.original_published_at)-
         Date.parse(candidates[i].original_published_at))>10*60000))
    return {
      schema:"geomacro.private-machine-original-binding.v1",
      status:"ORIGINAL_READBACK_NOT_PROVEN",accepted:false,
      independently_reread_original_count:pages.verified_original_count,
      observed_claim_sha256:report.claims[0].event_claim_sha256,
      semantic_same_event_claim_verified:false,
      source_derived_commercial_rights_verified:false,
      independent_external_reviewer_attested:false,
      signed_commercial_gro:false,payment_authorized:false,
      b2_requests:0,d1_writes:0,supabase_requests:0,payments:0,
    };
  const originalsProof=candidates.map((c,i)=>({
    article_bytes_sha256:pages.results[i].article_sha256,
    original_published_at:pages.results[i].original_published_at,
    same_event_claim_sha256:c.same_event_claim_sha256,
  })).sort((a,b)=>a.article_bytes_sha256.localeCompare(b.article_bytes_sha256));
  return {
    schema:"geomacro.private-machine-original-binding.v1",
    status:"TWO_ORIGINAL_BYTES_BOUND_SEMANTIC_AND_RIGHTS_PENDING",
    accepted:true,
    independently_reread_original_count:originalsProof.length,
    observed_claim_sha256:report.claims[0].event_claim_sha256,
    exact_original_evidence_set_sha256:digest(originalsProof),
    semantic_same_event_claim_verified:false,
    source_derived_commercial_rights_verified:false,
    independent_external_reviewer_attested:false,
    signed_commercial_gro:false,payment_authorized:false,
    b2_requests:0,d1_writes:0,supabase_requests:0,payments:0,
  };
}
