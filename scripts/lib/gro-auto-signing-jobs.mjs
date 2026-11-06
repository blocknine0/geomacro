import {randomBytes} from 'node:crypto';
const SHA=/^[a-f0-9]{64}$/;
const PREFIX='geomacro-evidence/v1/private/machine-gro-qualified/';
const iso=n=>new Date(n).toISOString();
export function createSigningJobDb({env=process.env,fetchImpl=fetch}={}){
 const account=env.CLOUDFLARE_ACCOUNT_ID,database=env.D1_DATABASE_ID,token=env.CLOUDFLARE_API_TOKEN;
 if(!/^[a-f0-9]{32}$/i.test(account??'')||!/^[a-f0-9-]{36}$/i.test(database??'')||String(token??'').length<20)
  throw Error('GRO_AUTO_SIGNING_DB_CONFIG_REQUIRED');
 return {async query(sql,params=[]){
  const response=await fetchImpl('https://api.cloudflare.com/client/v4/accounts/'+account+'/d1/database/'+database+'/query',{
   method:'POST',redirect:'error',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
   body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(15000)});
  const data=await response.json();
  if(!response.ok||data.success!==true||data.result?.length!==1||data.result[0]?.success===false||!Array.isArray(data.result[0]?.results))
   throw Error('GRO_AUTO_SIGNING_DB_UNAVAILABLE');
  return data.result[0].results;
 }};
}
export async function enqueueSigningJob(db,{sha256,key,country_iso3,expires_at},now=Date.now()){
 if(!SHA.test(sha256??'')||key!==PREFIX+sha256+'.json'||!/^[A-Z]{3}$/.test(country_iso3??'')||
    !Number.isFinite(Date.parse(expires_at))||Date.parse(expires_at)<=now)
  throw Error('GRO_AUTO_SIGNING_INPUT_INVALID');
 const stamp=iso(now);
 await db.query("INSERT OR IGNORE INTO gro_auto_signing_jobs(input_sha256,b2_key,country_iso3,available_at,expires_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
  [sha256,key,country_iso3,stamp,expires_at,stamp,stamp]);
 const rows=await db.query('SELECT input_sha256,b2_key,country_iso3,expires_at FROM gro_auto_signing_jobs WHERE input_sha256=?',[sha256]);
 if(rows.length!==1||rows[0].b2_key!==key||rows[0].country_iso3!==country_iso3||rows[0].expires_at!==expires_at)
  throw Error('GRO_AUTO_SIGNING_ENQUEUE_READBACK_FAILED');
 return {enqueued:true};
}
export async function claimSigningJob(db,{now=Date.now(),sha256=null}={}){
 if(sha256!==null&&!SHA.test(sha256))throw Error('GRO_AUTO_SIGNING_PIN_INVALID');
 const stamp=iso(now),lease=randomBytes(32).toString('hex');
 await db.query("UPDATE gro_auto_signing_jobs SET state='EXPIRED',lease_token=NULL,lease_until=NULL,updated_at=? WHERE input_sha256 IN (SELECT input_sha256 FROM gro_auto_signing_jobs WHERE state IN ('PENDING','RETRY') AND expires_at<=? LIMIT 50)",[stamp,stamp]);
 const rows=await db.query("UPDATE gro_auto_signing_jobs SET state='LEASED',lease_token=?,lease_until=?,attempts=attempts+1,updated_at=? WHERE input_sha256=(SELECT input_sha256 FROM gro_auto_signing_jobs WHERE expires_at>? AND (? IS NULL OR input_sha256=?) AND ((state IN ('PENDING','RETRY') AND available_at<=?) OR (state='LEASED' AND lease_until<=?)) ORDER BY created_at ASC LIMIT 1) RETURNING *",
  [lease,iso(now+30*60000),stamp,stamp,sha256,sha256,stamp,stamp]);
 if(rows.length>1)throw Error('GRO_AUTO_SIGNING_CLAIM_INVALID');
 return rows[0]??null;
}
export async function finishSigningJob(db,job,result,now=Date.now()){
 if(result?.ok!==true||result.country_iso3!==job.country_iso3||!SHA.test(result.record_sha256??'')||
    result.b2_archive_readback_verified!==true||result.canonical_d1_hot_readback_verified!==true||
    result.live_worker_signed_hot_verified!==true||!Number.isFinite(Date.parse(result.gro_expires_at))||Date.parse(result.gro_expires_at)<=now)
  throw Error('GRO_AUTO_SIGNING_PUBLICATION_UNVERIFIED');
 const rows=await db.query("UPDATE gro_auto_signing_jobs SET state='SIGNED',signed_record_sha256=?,signed_gro_expires_at=?,lease_token=NULL,lease_until=NULL,last_error_code=NULL,updated_at=? WHERE input_sha256=? AND state='LEASED' AND lease_token=? RETURNING input_sha256",
  [result.record_sha256,result.gro_expires_at,iso(now),job.input_sha256,job.lease_token]);
 if(rows.length!==1)throw Error('GRO_AUTO_SIGNING_LEASE_LOST');
}
export async function retrySigningJob(db,job,now=Date.now()){
 const delay=Math.min(20*60000,15000*2**Math.min(7,job.attempts));
 await db.query("UPDATE gro_auto_signing_jobs SET state=CASE WHEN expires_at<=? THEN 'EXPIRED' ELSE 'RETRY' END,available_at=?,lease_token=NULL,lease_until=NULL,last_error_code='QUALIFIED_SIGNING_OR_PUBLICATION_UNAVAILABLE',updated_at=? WHERE input_sha256=? AND state='LEASED' AND lease_token=?",
  [iso(now),iso(now+delay),iso(now),job.input_sha256,job.lease_token]);
}
