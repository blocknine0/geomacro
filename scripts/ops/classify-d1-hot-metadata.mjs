#!/usr/bin/env node
// #1827: read-only, metadata-only D1 expiry triage. Never receive or emit
// raw payload_json, article text, credentials, archive bytes or hash values.
// A passing metadata classification is NOT B2/GRO/rights/public health proof.
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const HOUR=60*60*1000;
const CONTRACT=Object.freeze({
  intelligence:Object.freeze({
    schema:"geomacro.public-intelligence-live.v1",
    proof:"geomacro.public-intelligence-live-proof.v1",
    key:"geomacro-evidence/v1/live/public-intelligence/latest.json.gz",
    maxAgeMs:6*HOUR,
  }),
  "global-risk":Object.freeze({
    schema:"geomacro.public-global-risk-live.v1",
    proof:"geomacro.public-global-risk-live-proof.v1",
    recoveryProof:"geomacro.public-global-risk-current-proof.v1",
    key:"geomacro-evidence/v1/live/global-risk/latest.json.gz",
    maxAgeMs:90*60*1000,
  }),
  "risk-indices":Object.freeze({
    schema:"geomacro.public-risk-indices-live.v1",
    proof:"geomacro.public-risk-indices-live-proof.v1",
    key:"geomacro-evidence/v1/live/risk-indices-independent/latest.json.gz",
    maxAgeMs:90*60*1000,
  }),
});
const NAMES=Object.freeze(Object.keys(CONTRACT));
const MAX_PAYLOAD_BYTES=768*1024;
const FUTURE_SKEW_MS=5*60*1000;

const boundedMinutes=ms=>Number.isFinite(ms)
  ?Math.max(-525600,Math.min(525600,Math.floor(ms/60000))):null;

export function classifyD1HotMetadata(rows,{nowMs=Date.now()}={}) {
  if(!Array.isArray(rows) || rows.length>3 || !Number.isFinite(nowMs))
    throw new Error("D1_METADATA_SHAPE_INVALID");
  const byName=new Map();
  for(const row of rows) {
    if(!row || typeof row!=="object" || !NAMES.includes(row.product) ||
       byName.has(row.product)) throw new Error("D1_METADATA_PRODUCTS_INVALID");
    byName.set(row.product,row);
  }
  const products={};
  for(const product of NAMES) {
    const row=byName.get(product);
    const rules=CONTRACT[product];
    if(!row) {
      products[product]={state:"ROW_ABSENT",reasons:["ROW_ABSENT"],
        source_age_minutes:null,expiry_in_minutes:null,metadata_eligible:false};
      continue;
    }
    const reasons=[];
    const generated=Date.parse(String(row.generated_at??""));
    const source=Date.parse(String(row.source_as_of??""));
    const expires=Date.parse(String(row.expires_at??""));
    if(!Number.isFinite(generated) || !Number.isFinite(source) ||
       !Number.isFinite(expires)) reasons.push("TIMESTAMP_INVALID");
    else {
      if(generated>nowMs+FUTURE_SKEW_MS || source>nowMs+FUTURE_SKEW_MS)
        reasons.push("FUTURE_TIMESTAMP");
      if(nowMs-source>rules.maxAgeMs) reasons.push("SOURCE_TOO_OLD");
      if(expires<=nowMs) reasons.push("EXPIRED");
      if(expires<=source || expires>source+rules.maxAgeMs)
        reasons.push("EXPIRY_WINDOW_INVALID");
    }
    if(row.schema_name!==rules.schema ||
       (row.proof_schema!==rules.proof &&
        row.proof_schema!==rules.recoveryProof) ||
       row.b2_object_key!==rules.key)
      reasons.push("PUBLISHER_CONTRACT_INVALID");
    if(Number(row.b2_hash_length)!==64 ||
       Number(row.payload_hash_length)!==64 ||
       !/^\d{1,20}$/.test(String(row.source_run_id??"")) ||
       !Number.isInteger(Number(row.payload_bytes)) ||
       Number(row.payload_bytes)<1 ||
       Number(row.payload_bytes)>MAX_PAYLOAD_BYTES)
      reasons.push("PROOF_METADATA_INVALID");
    products[product]={
      state:reasons.length?"METADATA_REJECTED":"METADATA_ONLY_POSSIBLE",
      reasons,source_age_minutes:boundedMinutes(nowMs-source),
      expiry_in_minutes:boundedMinutes(expires-nowMs),
      metadata_eligible:reasons.length===0,
    };
  }
  return {
    schema:"geomacro.d1-hot-metadata-expiry-diagnostic.v1",
    checked_at:new Date(nowMs).toISOString(),
    all_three_metadata_eligible:NAMES.every(p=>products[p].metadata_eligible),
    products,
    // This audit cannot promote source evidence or authorize settlement.
    payload_bytes_read:false,
    raw_source_exposed:false,
    b2_requests:0,supabase_reads:0,supabase_writes:0,
    d1_writes:0,payment_performed:false,
    commercial_eligibility_verified:false,
  };
}

export function parseWranglerMetadata(output,{nowMs=Date.now()}={}) {
  let payload;
  try {payload=JSON.parse(output);} catch {throw Error("D1_METADATA_OUTPUT_INVALID");}
  const blocks=Array.isArray(payload)?payload:payload?.result;
  if(!Array.isArray(blocks) || blocks.length!==1 ||
     blocks[0]?.success!==true ||
     !Array.isArray(blocks[0]?.results))
    throw Error("D1_METADATA_QUERY_NOT_VERIFIED");
  return classifyD1HotMetadata(blocks[0].results,{nowMs});
}

if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  // Bound any Wrangler output read; no raw output/log in error paths.
  let raw="";
  try {
    for await(const chunk of process.stdin) {
      raw+=chunk.toString("utf8");
      if(raw.length>64*1024) throw Error("D1_METADATA_OUTPUT_OVERSIZE");
    }
    const report=parseWranglerMetadata(raw);
    mkdirSync("artifacts/public-serving",{recursive:true});
    writeFileSync("artifacts/public-serving/d1-metadata.json",
      JSON.stringify(report,null,2)+"\n",{mode:0o600});
    console.log(JSON.stringify(report));
    if(!report.all_three_metadata_eligible) process.exitCode=2;
  } catch {
    console.error("::error::D1_METADATA_AUDIT_NOT_VERIFIED");
    process.exitCode=2;
  }
}
