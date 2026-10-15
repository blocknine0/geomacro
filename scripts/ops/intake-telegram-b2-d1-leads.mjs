#!/usr/bin/env node
/**
 * Source-bound Telegram evidence handoff: existing authorized B2 producer ->
 * hash-verified B2 lead -> D1 UNVERIFIED private pointer -> D1 queue ACK.
 * No Supabase, Postgres, scoring, publisher onboarding or payments.
 *
 * The upstream drainer verifies exact compressed B2 SHA and authorized v2
 * envelope. We revalidate the sanitized payload and queue identity before
 * writing only hashes/metadata to D1, never message bodies or headlines.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve, dirname, basename, sep } from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const SIGNAL=/^tg_[a-f0-9]{32}$/u;
const DELIVERY=/^tg_[a-f0-9]{32}_[a-f0-9]{16}$/u;
const SHA=/^[a-f0-9]{64}$/u;
const CHANNEL=/^[a-z0-9_]{5,32}$/u;
const B2=/^telegram\/leads\/\d{4}\/\d{2}\/\d{2}\/[a-z0-9_]{5,32}\/[1-9]\d*-[a-f0-9]{16}\.json\.gz$/u;
const SOURCE="telegram_authorized_publisher_feed";
const WRANGLER_VERSION="4.136.3";
const EXPECTED_D1="geomacro-control-plane";
const max=4;
const assert=(ok,code)=>{if(!ok)throw Error(code)};
const digest=s=>createHash("sha256").update(s).digest("hex");
function sql(s){return "'"+String(s).replaceAll("'","''")+"'";}
function originalDate(value){
  const s=String(value??"");
  const m=Date.parse(s);
  assert(s.length<=40&&Number.isFinite(m)&&m>0,"TELEGRAM_NATIVE_DATE_INVALID");
  return s;
}
export function validateTelegramDurableIntake(item,payload,payloadText){
  assert(item&&payload&&typeof item==="object"&&typeof payload==="object",
    "TELEGRAM_D1_INTAKE_OBJECT_INVALID");
  const delivery=String(item.delivery_id??"");
  const signal=String(item.signal_id??"");
  const channel=String(item.source_channel_key??"");
  const b2Key=String(item.b2_object_key??"");
  const b2Sha=String(item.b2_sha256??"");
  const record=Number(item.source_record_id);
  assert(DELIVERY.test(delivery)&&SIGNAL.test(signal)&&
    SHA.test(b2Sha)&&delivery===signal+"_"+b2Sha.slice(0,16),
    "TELEGRAM_D1_INTAKE_DELIVERY_ID_INVALID");
  assert(CHANNEL.test(channel)&&B2.test(b2Key)&&
    b2Key.includes("/"+channel+"/")&&
    Number.isSafeInteger(record)&&record>0,
    "TELEGRAM_D1_INTAKE_SOURCE_IDENTITY_INVALID");
  assert(item.queue_state==="PENDING" &&
    item.verification_status==="UNVERIFIED" &&
    item.scoring_eligible===false &&
    item.commercial_eligible===false,
    "TELEGRAM_D1_INTAKE_PREPROMOTION_FORBIDDEN");
  assert(payload.source_id===SOURCE&&
    payload.source_channel_key===channel&&
    String(payload.source_record_id)===String(record)&&
    payload.verification_status==="UNVERIFIED"&&
    typeof payload.headline==="string"&&
    payload.headline.length>0&&
    payload.raw_payload===null,
    "TELEGRAM_D1_INTAKE_SANITIZED_PAYLOAD_INVALID");
  const published=originalDate(item.published_at);
  assert(payload.published_at===published,"TELEGRAM_D1_INTAKE_PUBLICATION_MISMATCH");
  assert(typeof payloadText==="string"&&payloadText.length>0&&
    payloadText.length<=65536,"TELEGRAM_D1_INTAKE_PAYLOAD_SIZE_INVALID");
  return Object.freeze({
    delivery_id:delivery,signal_id:signal,source_id:SOURCE,
    source_channel_key:channel,source_record_id:record,
    published_at:published,b2_object_key:b2Key,b2_sha256:b2Sha,
    sanitized_payload_sha256:digest(payloadText),
  });
}
export function telegramD1IntakeSql(row,now=new Date()){
  assert(now instanceof Date&&!Number.isNaN(now.getTime()),
    "TELEGRAM_D1_INTAKE_CLOCK_INVALID");
  const fields=[
    "delivery_id","signal_id","source_id","source_channel_key",
    "source_record_id","published_at","b2_object_key",
    "b2_sha256","sanitized_payload_sha256","intake_at",
  ];
  const values=[
    sql(row.delivery_id),sql(row.signal_id),sql(row.source_id),
    sql(row.source_channel_key),String(row.source_record_id),
    sql(row.published_at),sql(row.b2_object_key),sql(row.b2_sha256),
    sql(row.sanitized_payload_sha256),sql(now.toISOString()),
  ];
  // A queue row whose original B2 pointer changed cannot be ingested.
  return `INSERT OR IGNORE INTO telegram_private_unverified_leads
    (${fields.join(",")})
    SELECT ${values.join(",")}
    WHERE EXISTS(SELECT 1 FROM telegram_signal_lead_queue
      WHERE delivery_id=${sql(row.delivery_id)} AND state='PENDING'
        AND signal_id=${sql(row.signal_id)}
        AND source_channel_key=${sql(row.source_channel_key)}
        AND source_record_id=${row.source_record_id}
        AND published_at=${sql(row.published_at)}
        AND b2_object_key=${sql(row.b2_object_key)}
        AND b2_sha256=${sql(row.b2_sha256)});`;
}
export function telegramD1AckSql(row){
  return `UPDATE telegram_signal_lead_queue
    SET state='CONSUMED',consumed_at=datetime('now'),last_error_code=NULL,
        last_attempt_at=datetime('now'),attempt_count=attempt_count+1
    WHERE delivery_id=${sql(row.delivery_id)} AND state='PENDING'
      AND EXISTS(SELECT 1 FROM telegram_private_unverified_leads
        WHERE delivery_id=${sql(row.delivery_id)}
          AND b2_sha256=${sql(row.b2_sha256)}
          AND sanitized_payload_sha256=${sql(row.sanitized_payload_sha256)}
          AND verification_status='UNVERIFIED'
          AND scoring_eligible=0 AND commercial_eligible=0);`;
}
export function telegramD1ReadbackSql(row){
  return `SELECT delivery_id,signal_id,source_id,source_channel_key,
    source_record_id,published_at,b2_object_key,b2_sha256,
    sanitized_payload_sha256,verification_status,scoring_eligible,commercial_eligible
    FROM telegram_private_unverified_leads
    WHERE delivery_id=${sql(row.delivery_id)} LIMIT 2;`;
}
function rows(raw){
  const a=JSON.parse(raw);
  const results=(Array.isArray(a)?a:[a]).flatMap(x=>Array.isArray(x?.results)?x.results:[]);
  assert(results.length<=2,"TELEGRAM_D1_UNEXPECTED_READBACK");
  return results;
}
function runD1(command){
  const config=process.env.D1_CONFIG;
  assert(config==="workers/control-plane/wrangler.runtime.jsonc"&&
    process.env.D1_DATABASE_NAME===EXPECTED_D1 &&
    Boolean(process.env.CLOUDFLARE_ACCOUNT_ID)&&
    Boolean(process.env.CLOUDFLARE_API_TOKEN)&&
    process.env.B2_ACCOUNT_QUOTA_REQUIRED==="1",
    "TELEGRAM_D1_INTAKE_PRODUCTION_CONFIG_REQUIRED");
  const output=execFileSync("npx",["-y",`wrangler@${WRANGLER_VERSION}`,
    "d1","execute","DB","--remote","--json","--config",config,
    "--command",command],{timeout:45000,maxBuffer:1024*1024,
    encoding:"utf8",stdio:["ignore","pipe","pipe"]});
  return rows(output);
}
function readSummary(path) {
  const s=JSON.parse(readFileSync(path,"utf8"));
  assert(s.schema==="geomacro.telegram-drain-proof.v2"&&
    Array.isArray(s.accepted)&&s.accepted.length<=max&&
    s.verified_objects===s.accepted.length,
    "TELEGRAM_D1_INTAKE_SUMMARY_INVALID");
  const root=resolve(dirname(path));
  const seen=new Set();
  return s.accepted.map(item=>{
    const id=String(item.delivery_id??"");
    const file=resolve(String(item.payload_file??""));
    assert(DELIVERY.test(id)&&!seen.has(id)&&
      dirname(file)===root&&basename(file)===id+".json",
      "TELEGRAM_D1_INTAKE_PATH_OR_DUPLICATE_INVALID");
    seen.add(id);
    const raw=readFileSync(file,"utf8");
    return validateTelegramDurableIntake(item,JSON.parse(raw),raw);
  });
}
export async function executeTelegramIntake(summaryFile){
  const entries=readSummary(summaryFile);
  let consumed=0;
  for(const entry of entries){
    runD1(telegramD1IntakeSql(entry));
    const readback=runD1(telegramD1ReadbackSql(entry));
    assert(readback.length===1&&Object.keys(entry).every(k=>
      String(readback[0][k])===String(entry[k]))&&
      readback[0].verification_status==="UNVERIFIED"&&
      Number(readback[0].scoring_eligible)===0&&
      Number(readback[0].commercial_eligible)===0,
      "TELEGRAM_D1_INTAKE_DURABLE_READBACK_MISMATCH");
    runD1(telegramD1AckSql(entry));
    const ack=runD1(`SELECT state FROM telegram_signal_lead_queue WHERE delivery_id=${sql(entry.delivery_id)} LIMIT 1;`);
    assert(ack.length===1&&ack[0].state==="CONSUMED",
      "TELEGRAM_D1_QUEUE_ACK_NOT_CONFIRMED");
    consumed++;
  }
  return {
    schema:"geomacro.telegram-supabase-free-d1-intake.v1",
    accepted:entries.length,consumed,durable_d1_readback:true,
    source_bound_unverified:true,scoring_eligible:false,commercial_eligible:false,
    supabase_connections:0,x402_charges:0,
  };
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  try {
    const args=process.argv.slice(2);
    assert(args.length===2&&args[0]==="--summary","TELEGRAM_D1_INTAKE_CLI_INVALID");
    const receipt=await executeTelegramIntake(args[1]);
    console.log(JSON.stringify(receipt));
  }catch(error){
    const code=error instanceof Error&&/^TELEGRAM_[A-Z0-9_]+$/.test(error.message)
      ?error.message:"TELEGRAM_D1_INTAKE_FAILED_CLOSED";
    console.error(JSON.stringify({ok:false,error:code,supabase_connections:0,x402_charges:0}));
    process.exitCode=1;
  }
}
