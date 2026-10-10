#!/usr/bin/env node
/**
 * D1-only compact three-domain 30m observation checkpoint.
 * Never turn source counts into published intelligence or use Supabase/B2.
 * Cloudflare env is restricted to production GitHub Actions, no browser keys.
 */
import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {createD1ControlPlaneStateClient} from "../lib/d1-control-plane-state.mjs";

const DOMAINS=["geopolitics","macro","rare_earth"];
function validCount(value) {return Number.isSafeInteger(value)&&value>=0&&value<=1000;}
export function projectSourcePulseForD1(report) {
  if(report?.schema!=="geomacro.private-three-domain-source-pulse-30m.v1"||
     report.target_poll_minutes!==30||!Array.isArray(report.actual_original_publisher_rows)||
     report.actual_original_publisher_rows.length!==3||
     !Number.isFinite(Date.parse(report.observed_at))||
     report.source_catalog_entries_are_not_events!==true||
     report.independently_verified_current_intelligence_count!==0||
     report.publisher_rights_verified!==false||
     report.b2_reads!==0||report.b2_writes!==0||report.d1_writes!==0||
     report.supabase_requests!==0||report.payments_performed!==0)
    throw Error("SOURCE_PULSE_CHECKPOINT_PROOF_INVALID");
  const rows=[];
  for(const domain of DOMAINS){
    const xs=report.actual_original_publisher_rows.filter(x=>x.domain===domain);
    if(xs.length!==1||xs[0].checked_at!==report.observed_at)
      throw Error("SOURCE_PULSE_CHECKPOINT_DOMAIN_INVALID");
    const row=xs[0],status=row.status;
    if(!["ORIGINAL_PUBLISHER_DATE_OBSERVED","SOURCE_TRANSPORT_DEGRADED"].includes(status)||
       row.chargeable_intelligence_ready!==false||
       row.signed_current_gro_verified!==false||
       row.commercial_rights_verified!==false)throw Error("SOURCE_PULSE_CHECKPOINT_RISK_BYPASS");
    const healthy=status==="ORIGINAL_PUBLISHER_DATE_OBSERVED";
    if(healthy&&!validCount(row.original_publisher_30m_topic_count))
      throw Error("SOURCE_PULSE_CHECKPOINT_30M_COUNT_INVALID");
    if(!healthy&&row.original_publisher_30m_topic_count!==null)
      throw Error("SOURCE_PULSE_CHECKPOINT_DEGRADED_COUNT_INVALID");
    rows.push({
      domain,
      checked_at:report.observed_at,
      status:healthy?"OBSERVED":"DEGRADED",
      last_success_at:healthy?report.observed_at:null,
      metadata:{
        schema:"geomacro.private-source-pulse-checkpoint.v1",
        domain,checked_at:report.observed_at,
        original_publisher_date_observed:healthy,
        original_publisher_30m_topic_count:healthy?row.original_publisher_30m_topic_count:null,
        commercial_eligible:false,
      },
    });
  }
  return rows;
}
export async function write30MinSourcePulseToD1({
  report,fetchImpl=fetch,
  createClient=createD1ControlPlaneStateClient,
}){
  const rows=projectSourcePulseForD1(report);
  if(!process.env.D1_DATABASE_ID) {
    const account=String(process.env.CLOUDFLARE_ACCOUNT_ID||"").trim();
    const token=String(process.env.CLOUDFLARE_API_TOKEN||"").trim();
    if(!account||!token)throw Error("SOURCE_PULSE_CLOUDFLARE_ACCESS_MISSING");
    const response=await fetchImpl(
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/d1/database?per_page=50`,{
      headers:{authorization:`Bearer ${token}`},
      redirect:"error",signal:AbortSignal.timeout(12000),
    });
    if(!response.ok)throw Error("SOURCE_PULSE_D1_DATABASE_DISCOVERY_FAILED");
    const envelope=await response.json();
    if(envelope?.success!==true||!Array.isArray(envelope.result))
      throw Error("SOURCE_PULSE_D1_DATABASE_DISCOVERY_INVALID");
    const matches=envelope.result.filter(r=>r?.name==="geomacro-control-plane"&&
      /^[0-9a-f-]{20,}$/iu.test(String(r.uuid??"")));
    if(matches.length!==1)throw Error("SOURCE_PULSE_D1_DATABASE_MISSING_OR_AMBIGUOUS");
    process.env.D1_DATABASE_ID=matches[0].uuid;
  }
  const client=createClient({pipeline:"official_source_pulse_30m"});
  for(const row of rows){
    const state={cursor:{status:row.status},...row.metadata};
    await client.persist(row.domain,state,{
      last_attempt_at:row.checked_at,
      last_success_at:row.last_success_at,
    });
  }
  const readback=await client.loadRows();
  for(const row of rows){
    const stored=readback.get(row.domain);
    if(stored?.last_attempt_at!==row.checked_at||
       stored?.cursor?.status!==row.status||
       stored?.payload?.checked_at!==row.checked_at||
       stored?.payload?.original_publisher_30m_topic_count!==
         row.metadata.original_publisher_30m_topic_count)
      throw Error("SOURCE_PULSE_D1_READBACK_MISMATCH");
  }
  return {
    schema:"geomacro.private-30m-source-pulse-d1-write-receipt.v1",
    checked_at:report.observed_at,rows_written:3,d1_readback_verified:true,
    source_current_scored_intelligence_verified:false,
    b2_requests:0,supabase_requests:0,payment_performed:false,
  };
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  try{
    const report=JSON.parse(readFileSync(
      "artifacts/private-intake/three-domain-30m-source-pulse.json","utf8"));
    const receipt=await write30MinSourcePulseToD1({report});
    mkdirSync("artifacts/private-intake",{recursive:true});
    writeFileSync("artifacts/private-intake/three-domain-30m-d1-readback.json",
      JSON.stringify(receipt,null,2)+"\n",{mode:0o600});
    console.log(JSON.stringify(receipt));
  }catch{
    console.error("::error::SOURCE_PULSE_D1_CHECKPOINT_NOT_VERIFIED");
    process.exitCode=2;
  }
}
