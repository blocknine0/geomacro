#!/usr/bin/env node
/**
 * ReliefWeb approval-gated live ORIGINAL-METADATA observer.
 * NO Supabase, D1, B2, x402, raw-text persistence or paid publication.
 * ReliefWeb hosts partner reports: its transport is NEVER an independent
 * originating-publisher corroboration or commercial redistribution grant.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

const ENDPOINT = "https://api.reliefweb.int/v2/reports";
const MAX_RESULTS = 80;
const MAX_RESPONSE_BYTES = 512 * 1024;
const THRESHOLD_MS = 24 * 60 * 60 * 1000;
const OUTPUT = "artifacts/expanded-official-source/reliefweb-approved.json";
const APPNAME = /^[A-Za-z][A-Za-z0-9_.-]{7,100}$/u;
const iso3 = /^[A-Z]{3}$/u;

function validAppname(value) {
  const name = String(value ?? "").trim();
  // Geomacro's historical domain-only test was NOT a provider approval.
  return APPNAME.test(name) && name !== "geomacro.live" ? name : null;
}
function validOriginalDate(value, now) {
  if (typeof value !== "string") return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp > 0 &&
    timestamp <= now.getTime();
}
function empty(status, checkedAt, code) {
  return {
    schema: "geomacro.reliefweb-approved-private-observation.v1",
    status, checked_at: checkedAt, reason: code,
    provider: "reliefweb",
    appname_approved_configured: status !== "CONFIG_REQUIRED",
    api_request_attempted: false,
    api_requests: 0,
    sampled_reports: 0,
    reports_with_original_native_date: 0,
    sampled_original_reports_within_24h: 0,
    sampled_distinct_countries: 0,
    // ReliefWeb is humanitarian/geopolitical CONTEXT, not three independent
    // official macro/mineral release publishers.
    observed_domain: "geopolitics",
    event_corroboration_verified: false,
    original_publisher_page_date_verified: false,
    independent_original_publisher_verified: false,
    publisher_rights_verified: false,
    current_scored_intelligence_verified: false,
    commercial_eligible: false,
    derived_only: true,
    raw_report_bodies_stored: false,
    raw_original_data_delivered: false,
    supabase_requests: 0, d1_requests: 0, b2_requests: 0,
    usdc_spent: 0,
  };
}
async function boundedJson(response) {
  if (Number(response.headers.get("content-length") || 0) > MAX_RESPONSE_BYTES) {
    throw Error("RELIEFWEB_APPROVED_RESPONSE_TOO_LARGE");
  }
  if (!response.body) throw Error("RELIEFWEB_APPROVED_RESPONSE_EMPTY");
  const reader = response.body.getReader();
  const parts = [];
  let total = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw Error("RELIEFWEB_APPROVED_RESPONSE_TOO_LARGE");
      }
      parts.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  try { return JSON.parse(Buffer.concat(parts).toString("utf8")); }
  catch { throw Error("RELIEFWEB_APPROVED_JSON_INVALID"); }
}
export async function observeApprovedReliefWeb({
  appname = process.env.RELIEFWEB_APPROVED_APPNAME,
  now = new Date(),
  fetchImpl = fetch,
} = {}) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw Error("RELIEFWEB_APPROVED_CLOCK_INVALID");
  }
  const checkedAt = now.toISOString();
  const approved = validAppname(appname);
  if (!approved) return empty("CONFIG_REQUIRED",checkedAt,"APPROVED_APPNAME_NOT_INSTALLED");
  const url = new URL(ENDPOINT);
  url.searchParams.set("appname",approved);
  let response;
  try {
    response = await fetchImpl(url.toString(),{
      method: "POST",
      redirect: "error",
      headers: {Accept:"application/json","Content-Type":"application/json"},
      body: JSON.stringify({
        preset:"latest",profile:"list",limit:MAX_RESULTS,
        fields:{include:[
          "id","date.original","date.created","date.changed",
          "source.name","source.shortname","country.iso3",
        ]},
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    // A scheduled transport failure must produce a machine-checkable PRIVATE
    // failure receipt. Do not retry a potentially rate-limited provider.
    return {...empty("TRANSPORT_DEGRADED",checkedAt,"RELIEFWEB_APPROVED_TRANSPORT_FAILED"),
      api_request_attempted:true,api_requests:1};
  }
  if (response.status === 401 || response.status === 403 || response.status === 429) {
    return {...empty("ACCESS_DENIED_OR_QUOTA",checkedAt,"RELIEFWEB_HTTP_"+response.status),
      api_request_attempted:true,api_requests:1};
  }
  if (!response.ok) {
    // Do not retry 5xx within this cadence; distinguish a temporary outage
    // from a configured-access denial for the operator.
    return {...empty("UPSTREAM_HTTP_DEGRADED",checkedAt,
      response.status >= 500 ? "RELIEFWEB_HTTP_5XX" : "RELIEFWEB_HTTP_OTHER"),
      api_request_attempted:true,api_requests:1};
  }
  const parsed = await boundedJson(response);
  if (!Array.isArray(parsed?.data) || parsed.data.length > MAX_RESULTS) {
    throw Error("RELIEFWEB_APPROVED_RESPONSE_SHAPE_INVALID");
  }
  const seen = new Set();
  const countries = new Set();
  let nativeDateCount=0, freshNativeDateCount=0;
  for (const item of parsed.data) {
    const key = String(item?.id ?? "").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const fields = item?.fields;
    const published = fields?.date?.original;
    if (validOriginalDate(published,now)) {
      nativeDateCount += 1;
      if (now.getTime()-Date.parse(published) <= THRESHOLD_MS) freshNativeDateCount += 1;
    }
    if (Array.isArray(fields?.country)) {
      for (const c of fields.country) {
        if (iso3.test(String(c?.iso3 ?? "").toUpperCase()))
          countries.add(String(c.iso3).toUpperCase());
      }
    }
  }
  return {
    ...empty("LIVE_METADATA_TRANSPORT",checkedAt,null),
    appname_approved_configured:true,
    api_request_attempted:true,api_requests:1,
    sampled_reports:seen.size,
    reports_with_original_native_date:nativeDateCount,
    sampled_original_reports_within_24h:freshNativeDateCount,
    sampled_distinct_countries:countries.size,
    // A fresh report's original field is not the original publisher's
    // verified article-page publication time or a corroborated event.
    original_report_date_is_not_publisher_page_proof:true,
  };
}
function run() {
  return observeApprovedReliefWeb().then(proof=>{
    mkdirSync(dirname(OUTPUT),{recursive:true});
    writeFileSync(OUTPUT,JSON.stringify(proof,null,2)+"\n",{mode:0o600});
    console.log(JSON.stringify(proof));
    if (proof.status !== "LIVE_METADATA_TRANSPORT") {
      // A successfully executed Actions job is NOT proof that ReliefWeb is
      // working. GitHub monitors must stay red until provider acceptance.
      console.error("::error title=ReliefWeb live-source not accepted::"+
        proof.status+"; inspect sanitized receipt, verify production appname and provider allowance.");
      process.exitCode=3;
    }
  }).catch(error=>{
    const code = error instanceof Error ? error.message : "RELIEFWEB_APPROVED_FAILED";
    const safe = /^RELIEFWEB_APPROVED_[A-Z0-9_]+$/u.test(code)?code:"RELIEFWEB_APPROVED_FAILED";
    // Sanitized fail receipt even for malformed upstream JSON. No partner
    // report text, appname, original URL, session or API token.
    const receipt = {...empty("INVALID_PROVIDER_RESPONSE",new Date().toISOString(),safe),
      api_request_attempted:true,api_requests:1};
    mkdirSync(dirname(OUTPUT),{recursive:true});
    writeFileSync(OUTPUT,JSON.stringify(receipt,null,2)+"\n",{mode:0o600});
    console.error(JSON.stringify({ok:false,error:safe,raw_data_written:false}));
    process.exitCode=1;
  });
}
if(process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await run();
