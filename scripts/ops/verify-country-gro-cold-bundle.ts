#!/usr/bin/env bun
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { createB2Client } from "./b2-s3-client.mjs";
import { verifyRiskObjectSignature, canonicalRiskObjectJson } from "../../src/lib/risk-object-signing.server";
import { verifyCommercialRiskObjectArtifact } from "../../src/lib/commercial-risk-object-policy";

const ENDPOINT="https://s3.us-east-005.backblazeb2.com";
const BUCKET="geomacro-private-archive";
const PROOF_KEY="geomacro-evidence/v1/live/country-gro/hot-bundle-proof.json";
const WRANGLER_VERSION=String(process.env.WRANGLER_VERSION??"4.136.3");
const D1_DATABASE_NAME=String(process.env.D1_DATABASE_NAME??"geomacro-control-plane");
const OUT=join(process.cwd(),"artifacts","global-gro-continuity");
const CONFIG=join(OUT,"wrangler.country-gro-audit.jsonc");
const sha=(v:Buffer|string)=>createHash("sha256").update(v).digest("hex");
const access=String(process.env.B2_ARCHIVE_READ_KEY_ID??process.env.B2_KEY_ID??"").trim();
const secret=String(process.env.B2_ARCHIVE_READ_APPLICATION_KEY??process.env.B2_APPLICATION_KEY??"").trim();
if(!access||!secret||!process.env.CLOUDFLARE_API_TOKEN||!process.env.CLOUDFLARE_ACCOUNT_ID) throw new Error("COUNTRY_GRO_COLD_AUDIT_CONFIG_INVALID");
const b2=createB2Client({endpointUrl:ENDPOINT,accessKey:access,secretKey:secret,bucket:BUCKET});
const proofBytes=await b2.get(PROOF_KEY);
const proof=JSON.parse(proofBytes.toString("utf8"));
if(proof?.schema!=="geomacro.country-gro-verified-hot-proof.v1"||proof?.archive_write_acknowledged!==true||!/^[a-f0-9]{64}$/.test(String(proof?.bundle_sha256??""))) throw new Error("COUNTRY_GRO_COLD_AUDIT_PROOF_INVALID");
const bundleBytes=await b2.get(String(proof.bundle_key));
if(sha(bundleBytes)!==proof.bundle_sha256||bundleBytes.length!==Number(proof.bundle_bytes)) throw new Error("COUNTRY_GRO_COLD_AUDIT_BUNDLE_HASH_INVALID");
const bundle=JSON.parse(gunzipSync(bundleBytes,{maxOutputLength:120*1024*1024}).toString("utf8"));
if(bundle?.schema!=="geomacro.country-gro-verified-hot-bundle.v1"||bundle?.country_count!==proof.country_count||!Array.isArray(bundle?.entries)) throw new Error("COUNTRY_GRO_COLD_AUDIT_BUNDLE_INVALID");
for(const row of bundle.entries){
  const object=JSON.parse(String(row.object_json??""));
  if(sha(canonicalRiskObjectJson(object))!==row.record_sha256||!verifyRiskObjectSignature(object).valid||!verifyCommercialRiskObjectArtifact(object,{now:new Date(proof.generated_at)}).deliverable) throw new Error(`COUNTRY_GRO_COLD_AUDIT_MEMBER_INVALID:${row.country_iso3}`);
}
mkdirSync(OUT,{recursive:true});
const raw=execFileSync("npx",["-y",`wrangler@${WRANGLER_VERSION}`,"d1","list","--json"],{encoding:"utf8",env:process.env});
const list=JSON.parse(raw);
const id=String(list.find((x:any)=>x.name===D1_DATABASE_NAME)?.uuid??list.find((x:any)=>x.name===D1_DATABASE_NAME)?.id??"");
if(!/^[0-9a-f-]{20,}$/i.test(id)) throw new Error("COUNTRY_GRO_COLD_AUDIT_D1_NOT_FOUND");
writeFileSync(CONFIG,readFileSync("workers/control-plane/wrangler.example.jsonc","utf8").replace("REPLACE_WITH_D1_DATABASE_ID",id),{mode:0o600});
execFileSync("npx",["-y",`wrangler@${WRANGLER_VERSION}`,"d1","execute","DB","--remote","--yes","--config",CONFIG,"--command",`UPDATE country_gro_verified_hot SET archive_readback_verified=1, updated_at='${new Date().toISOString()}' WHERE archive_key='${String(proof.bundle_key).replaceAll("'","''")}' AND archive_sha256='${proof.bundle_sha256}';`],{encoding:"utf8",env:process.env,maxBuffer:64*1024*1024});
console.log(JSON.stringify({ok:true,schema:"geomacro.country-gro-cold-archive-audit.v1",bundle_key:proof.bundle_key,bundle_sha256:proof.bundle_sha256,country_count:bundle.entries.length,b2_reads:2,archive_readback_verified:true,hot_serving_was_not_blocked_on_this_audit:true,external_payment_performed:false,execution_authorized:false,destructive_b2_change:false},null,2));
