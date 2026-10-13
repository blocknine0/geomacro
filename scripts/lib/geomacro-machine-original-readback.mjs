import {createHash} from "node:crypto";
import {evaluateGeomacroMachineCorroboration} from "./geomacro-machine-corroboration.mjs";
import {registeredOriginalPublisherOrganization} from "./independent-same-event-qualification.mjs";
import {
  approvedFirstPartyOriginalArticleUrl, verifiedPublisherPageDate,
} from "./official-original-article-date.mjs";

const MAX_FETCHES=2;
const MAX_BYTES=384*1024;
const MAX_AGE_MS=6*60*60*1000;
const HEX=/^[a-f0-9]{64}$/u;
const MIME=/^text\/html(?:;|$)/iu;

function deny(){throw Error("GEOMACRO_MACHINE_ORIGINAL_READBACK_UNVERIFIED");}
function qualified(candidate,now){
  if(!candidate || typeof candidate!=="object" || Array.isArray(candidate) ||
    !["geopolitics","macro","rare_earth"].includes(candidate.category) ||
    typeof candidate.original_article_url!=="string" ||
    typeof candidate.original_article_sha256!=="string" ||
    !HEX.test(candidate.original_article_sha256) ||
    typeof candidate.original_published_at!=="string" ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/u.test(candidate.original_published_at))
    deny();
  const t=Date.parse(candidate.original_published_at);
  if(!Number.isFinite(t)||t>now||now-t>MAX_AGE_MS)deny();
  let article;
  try {article=new URL(candidate.original_article_url);}catch{deny()}
  const org=registeredOriginalPublisherOrganization(article.hostname.toLowerCase());
  const canonical=approvedFirstPartyOriginalArticleUrl(candidate.original_article_url,candidate.category);
  if(!canonical || !org || org!==candidate.originating_reporting_organization_id ||
    candidate.publisher_organization_id!==org || article.hostname!==candidate.publisher_host)
    deny();
  return {canonical,org};
}

/**
 * First-party exact-article readback for private machine-matched originals.
 *
 * The caller has to provide already normalized, privately admitted candidates;
 * the existing pairing checks run BEFORE any network attempt. Re-reading
 * origin bytes / native publication metadata is a separate proof, not legal
 * rights, counterevidence audit, source-claim truth or reviewer approval.
 *
 * No B2, D1, Supabase, payment, persistence, customer output or logging.
 * Never emit source URLs, publisher IDs, article hashes or article content.
 */
export async function verifyMachineOriginalReadbacks({
  candidates=[],now=new Date(),fetchImpl=fetch,
}={}){
  const machine=evaluateGeomacroMachineCorroboration({candidates,now});
  const result={
    schema:"geomacro.private-machine-original-readback.v1",
    observed_at:now.toISOString(),
    structurally_matched_claim_count:machine.multiple_original_machine_candidates,
    article_checks_attempted:0,
    article_exact_bytes_verified:0,
    article_native_clock_verified:0,
    independent_original_organizations_readback:0,
    publisher_article_readback_verified:false,
    event_semantics_independently_verified:false,
    legal_commercial_use_verified:false,
    external_reviewer_attested:false,
    machine_signed_gro_created:false,
    commercial_eligible:false,
    x402_payment_authorized:false,
    raw_upstream_disclosed:false,
    d1_writes:0,b2_requests:0,supabase_requests:0,payments:0,
  };
  const claim=machine.claims.find(x=>
    x.candidate_status==="TWO_ORIGINAL_MACHINE_MATCH_REQUIRES_SOURCE_AUDIT");
  if(!claim)return result;

  const selected=[],seenOrg=new Set();
  // Scope network fanout to ONLY one matched claim and exactly two independent
  // original organizations, even when private caller submits many records.
  for(const c of candidates){
    if(c.same_event_claim_sha256!==claim.event_claim_sha256)continue;
    const q=qualified(c,now.getTime());
    if(seenOrg.has(q.org))continue;
    seenOrg.add(q.org);selected.push({candidate:c,canonical:q.canonical});
    if(selected.length===MAX_FETCHES)break;
  }
  if(selected.length!==MAX_FETCHES)return result;

  result.article_checks_attempted=selected.length;
  const checked=await Promise.all(selected.map(async ({candidate,canonical})=>{
    try {
      const response=await fetchImpl(canonical,{
        method:"GET",redirect:"error",cache:"no-store",
        headers:{accept:"text/html"},
        signal:AbortSignal.timeout(4000),
      });
      if(!response || !response.ok || !MIME.test(response.headers.get("content-type")??"") ||
        !response.body || Number(response.headers.get("content-length")||0)>MAX_BYTES)
        return {bytes:false,clock:false};
      const reader=response.body.getReader(),chunks=[];let n=0;
      try {
        while(true){
          const {done,value}=await reader.read();if(done)break;
          n+=value.byteLength;if(n>MAX_BYTES)return {bytes:false,clock:false};
          chunks.push(Buffer.from(value));
        }
      } finally {reader.releaseLock()}
      if(n===0)return {bytes:false,clock:false};
      const buffer=Buffer.concat(chunks);
      if(createHash("sha256").update(buffer).digest("hex")!==
        candidate.original_article_sha256)return {bytes:false,clock:false};
      let html;
      try {html=new TextDecoder("utf-8",{fatal:true}).decode(buffer);}
      catch{return {bytes:true,clock:false};}
      const verified=verifiedPublisherPageDate(html,now);
      return {bytes:true,clock:verified!==null &&
        Date.parse(verified)===Date.parse(candidate.original_published_at)};
    }catch{return {bytes:false,clock:false};}
  }));
  result.article_exact_bytes_verified=checked.filter(x=>x.bytes).length;
  result.article_native_clock_verified=checked.filter(x=>x.clock).length;
  result.independent_original_organizations_readback=
    checked.every(x=>x.bytes&&x.clock)?MAX_FETCHES:0;
  result.publisher_article_readback_verified=
    result.independent_original_organizations_readback===MAX_FETCHES;
  return result;
}
