/**
 * One atomic indexed D1 UPSERT per failed source-domain poll.
 * Replaces an unsafe SELECT consecutive_failures followed by UPSERT:
 * concurrent workers previously read the same count, overwriting increments.
 *
 * Database remains the single authority for exponential 5m/15m/60m backoff.
 * This does not loosen the source/rights filter, D1 owner 140k quotas, queues,
 * or the Predge non-commercial 72h feed contract.
 */
export const P1_DOMAIN_FAILURE_UPSERT_SQL=
 "INSERT INTO p1_source_domain_backoff "+
 "(hostname,consecutive_failures,next_allowed_at,last_failure_state,updated_at) "+
 "VALUES (?,1,?,?,?) ON CONFLICT(hostname) DO UPDATE SET "+
 "consecutive_failures=min(100,p1_source_domain_backoff.consecutive_failures+1),"+
 "next_allowed_at=max(p1_source_domain_backoff.next_allowed_at,"+
 "CASE WHEN excluded.last_failure_state IN ('DENIED','RATE_LIMITED') "+
 "THEN excluded.next_allowed_at "+
 "WHEN p1_source_domain_backoff.consecutive_failures<1 "+
 "THEN excluded.next_allowed_at "+
 "WHEN p1_source_domain_backoff.consecutive_failures=1 THEN ? ELSE ? END),"+
 "last_failure_state=excluded.last_failure_state,"+
 "updated_at=excluded.updated_at";

const FAILURE_STATES=new Set(["UNAVAILABLE","DENIED","RATE_LIMITED","MALFORMED"]);
const toIso=n=>new Date(n).toISOString();

export async function recordP1DomainFailure(db,{hostname,state,now=Date.now(),delay}={}){
 if(!FAILURE_STATES.has(state))return {updated:false,reason:"NO_FAILURE"};
 if(!db?.prepare||typeof hostname!=="string"||
    !/^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/u.test(hostname)||
    !Number.isSafeInteger(now)||now<0||now>8_640_000_000_000_000||
    (delay!==undefined&&(!Number.isSafeInteger(delay)||delay<0)))
  throw Error("P1_DOMAIN_BACKOFF_INPUT_UNVERIFIED");
 const firstMs=state==="DENIED"?3_600_000:
   state==="RATE_LIMITED"?Math.max(300_000,delay??300_000):300_000;
 const firstUntil=toIso(now+firstMs);
 const at15=toIso(now+900_000),at60=toIso(now+3_600_000);
 const receipt=await db.prepare(P1_DOMAIN_FAILURE_UPSERT_SQL)
   .bind(hostname,firstUntil,state,toIso(now),at15,at60).run();
 if(receipt?.meta?.changes!==1)
  throw Error("P1_DOMAIN_BACKOFF_ATOMIC_D1_ACK_UNVERIFIED");
 return {updated:true,statement_count:1,pre_read_statements:0};
}
