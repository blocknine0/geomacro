/**
 * Issue #2229. SHA-only production D1 classifier work/ack ledger.
 * Does NOT certify original content, rights, signatures, or paid intelligence.
 */
export const PRIVATE_SCORING_ATTEMPTS_PIPELINE="official_source_private_classifier_attempts";
export const PRIVATE_SCORING_ATTEMPTS_SCHEMA="geomacro.private-original-classifier-attempts.v1";
const ISO=/^20\d{2}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u;
const SHA=/^[a-f0-9]{64}$/u;
const DOMAINS=new Set(["geopolitics","macro","rare_earth"]);
const MIN_RETRY_DELAY_MS=25*60*1000;
const SOURCE_MAX_AGE_MS=24*60*60*1000;
const MAX_TRACKED=240;
const fail=()=>{throw Error("PRIVATE_CLASSIFIER_ATTEMPT_LEDGER_INVALID")};
const time=s=>typeof s==="string"&&ISO.test(s)?Date.parse(s):NaN;
export function readPrivateClassifierAttempts(row,domain,now=Date.now()){
  if(!DOMAINS.has(domain)||!Number.isFinite(now))fail();
  if(!row)return [];
  const p=row.payload;
  if(p?.schema!==PRIVATE_SCORING_ATTEMPTS_SCHEMA||
     p.domain!==domain||!Array.isArray(p.records)||
     p.records.length>MAX_TRACKED)fail();
  const seen=new Set(),records=[];
  for(const e of p.records){
    if(!e||e.domain!==domain||!SHA.test(e.article_sha256)||
       !Number.isFinite(time(e.native_published_at))||
       !Number.isFinite(time(e.claimed_at))||
       !Number.isSafeInteger(e.attempts)||e.attempts<1||e.attempts>2||
       !["CLAIMED","ACKED_CLASSIFIED","EXHAUSTED"].includes(e.status)||
       !/^\d{1,24}$/u.test(e.run_id)||seen.has(e.article_sha256)||
       time(e.claimed_at)>now+30000||
       (e.status==="ACKED_CLASSIFIED" && (!Number.isFinite(time(e.acknowledged_at))||
         time(e.acknowledged_at)<time(e.claimed_at)))||
       (e.status!=="ACKED_CLASSIFIED"&&e.acknowledged_at!==null))fail();
    seen.add(e.article_sha256);
    // Retain identifiers across the whole fresh-original horizon.
    if(now-time(e.native_published_at)<=30*60*60*1000)records.push(e);
  }
  return records;
}
export function pickPrivateClassifierWork({
  domain,source,ledger,now=Date.now(),currentCandidates=[],
}={}){
  if(!DOMAINS.has(domain)||!Number.isFinite(now)||!Array.isArray(currentCandidates)||
     currentCandidates.length>80)fail();
  const p=source?.payload??source;
  if(p?.schema!=="geomacro.private-source-pulse-checkpoint.v1"||
     p.domain!==domain||!Number.isFinite(time(p.checked_at))||
     p.checked_at && time(p.checked_at)>now+30000||
     now-time(p.checked_at)>45*60*1000||
     p.commercial_eligible!==false||p.original_review_claims_verified!==false||
     !Array.isArray(p.private_original_review_refs)||
     !Array.isArray(p.recent_private_article_fingerprints)||
     !Array.isArray(p.newly_seen_private_article_refs))fail();
  const records=readPrivateClassifierAttempts(ledger,domain,now);
  const byLedger=new Map(records.map(e=>[e.article_sha256,e]));
  const history=new Map();
  for(const h of p.recent_private_article_fingerprints){
    if(h?.domain!==domain||!SHA.test(h.article_sha256)||
       !Number.isFinite(time(h.native_published_at))||
       history.has(h.article_sha256))fail();
    history.set(h.article_sha256,h.native_published_at);
  }
  const queue=new Map();
  for(const entry of p.private_original_review_refs){
    if(entry?.domain!==domain||entry.review_status!=="UNVERIFIED"||
       entry.payment_eligible!==false||!SHA.test(entry.article_sha256)||
       history.get(entry.article_sha256)!==entry.native_published_at||
       queue.has(entry.article_sha256))fail();
    queue.set(entry.article_sha256,entry);
  }
  const novel=new Set(p.newly_seen_private_article_refs);
  if([...novel].some(x=>!SHA.test(x)||!queue.has(x)))fail();
  const seen=new Set(),eligible=[];
  for(const c of currentCandidates){
    const id=c?.original_article_sha256,clock=c?.native_published_at;
    if(!SHA.test(id)||seen.has(id)||!queue.has(id)||
       history.get(id)!==clock||!Number.isFinite(time(clock))||
       time(clock)>now||now-time(clock)>SOURCE_MAX_AGE_MS)continue;
    seen.add(id);
    const old=byLedger.get(id);
    if(old && old.native_published_at!==clock)fail();
    if(old?.status==="ACKED_CLASSIFIED"||old?.status==="EXHAUSTED")continue;
    if(old && (old.attempts>=2 ||
       now-time(old.claimed_at)<MIN_RETRY_DELAY_MS))continue;
    // The D1 original-observation ledger is NOT the classifier-attempt
    // ledger. If a quota preflight held BEFORE claim, that exact SHA can be
    // reobserved as non-novel next poll without any classifier ever running.
    // Attempt numbers and retries must come exclusively from the durable
    // classifier claim/ACK ledger, never from source novelty.
    eligible.push({article_sha256:id,native_published_at:clock,
      next_attempts:old?2:1,retry:!!old});
  }
  eligible.sort((a,b)=>b.native_published_at.localeCompare(a.native_published_at)||
    a.article_sha256.localeCompare(b.article_sha256));
  return eligible.slice(0,1);
}
export function claimPrivateClassifierWork({domain,ledger,work,now,runId}={}){
  if(!DOMAINS.has(domain)||!Number.isFinite(time(now))||
     !/^\d{1,24}$/u.test(String(runId))||!work||
     !SHA.test(work.article_sha256)||!Number.isFinite(time(work.native_published_at))||
     ![1,2].includes(work.next_attempts))fail();
  const records=readPrivateClassifierAttempts(ledger,domain,time(now));
  const existing=records.find(x=>x.article_sha256===work.article_sha256);
  if(existing){
    if(existing.native_published_at!==work.native_published_at ||
       existing.status!=="CLAIMED"||
       existing.attempts!==work.next_attempts-1 ||
       time(now)-time(existing.claimed_at)<MIN_RETRY_DELAY_MS)fail();
    if(work.retry!==true)fail();
  } else if(work.next_attempts!==1 || work.retry!==false)fail();
  const next={domain,article_sha256:work.article_sha256,
    native_published_at:work.native_published_at,
    attempts:work.next_attempts,status:"CLAIMED",
    claimed_at:now,run_id:String(runId),acknowledged_at:null};
  const result=[...records.filter(e=>e.article_sha256!==next.article_sha256),next];
  if(result.length>MAX_TRACKED)fail();
  return {schema:PRIVATE_SCORING_ATTEMPTS_SCHEMA,domain,records:result};
}
export function acknowledgePrivateClassifierWork({
  domain,ledger,now,runId,attempted=[],returned=[],
}={}){
  if(!DOMAINS.has(domain)||!Number.isFinite(time(now))||
     !/^\d{1,24}$/u.test(String(runId))||
     !Array.isArray(attempted)||!Array.isArray(returned)||
     attempted.length>1||returned.length>1 ||
     [...attempted,...returned].some(id=>!SHA.test(id)))fail();
  const records=readPrivateClassifierAttempts(ledger,domain,time(now));
  const claim=records.filter(e=>e.run_id===String(runId)&&e.status==="CLAIMED");
  if(claim.length!==1 || returned.some(id=>!attempted.includes(id))||
     [...attempted,...returned].some(id=>id!==claim[0].article_sha256))fail();
  const chosen=claim[0];
  const updated={
    ...chosen,status:returned.includes(chosen.article_sha256)
      ?"ACKED_CLASSIFIED":chosen.attempts===2||
        !attempted.includes(chosen.article_sha256)?"EXHAUSTED":"CLAIMED",
    acknowledged_at:returned.includes(chosen.article_sha256)?now:null,
  };
  const next=records.map(e=>e.article_sha256===chosen.article_sha256?updated:e);
  return {schema:PRIVATE_SCORING_ATTEMPTS_SCHEMA,domain,records:next};
}
export function validateClaimForPrivateScorer(source,ledger,domain,runId,now=Date.now()){
  const p=source?.payload;
  if(!p||source.last_attempt_at!==p.checked_at ||
     !Array.isArray(p.private_classifier_work_refs)||
     p.private_classifier_work_refs.length>1||!Number.isFinite(time(p.checked_at))||
     now-time(p.checked_at)>45*60*1000||time(p.checked_at)>now)fail();
  const records=readPrivateClassifierAttempts(ledger,domain,now);
  const selected=p.private_classifier_work_refs;
  const claimed=records.filter(x=>x.run_id===String(runId)&&
    x.status==="CLAIMED"&&selected.includes(x.article_sha256));
  if(selected.length!==claimed.length)fail();
  for(const e of claimed){
    const original=p.recent_private_article_fingerprints.find(x=>
      x.article_sha256===e.article_sha256&&
      x.native_published_at===e.native_published_at);
    if(!original||now-time(e.native_published_at)>SOURCE_MAX_AGE_MS)fail();
  }
  return new Set(claimed.map(e=>e.article_sha256));
}
