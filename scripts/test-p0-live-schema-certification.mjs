#!/usr/bin/env node
/**
 * Live P0 schema/transport certification.
 * Read-only. Never enables a source.
 */
import fs from "node:fs/promises";
import { parseMofcomExportControlHtml } from "../global-intelligence/adapters/china-mofcom.mjs";
import { parseAustraliaCriticalMineralsHtml } from "../global-intelligence/adapters/australia-critical-minerals.mjs";
import { parseCochilcoAnuarioHtml } from "../global-intelligence/adapters/cochilco-minerals.mjs";
import { parseOpcwNewsHtml } from "../global-intelligence/adapters/opcw-news.mjs";
import { parseIcjCasesHtml } from "../global-intelligence/adapters/icj-cases.mjs";
import { parseIccNewsHtml } from "../global-intelligence/adapters/icc-news.mjs";

const registry = JSON.parse(await fs.readFile(new URL("../config/global-p0-source-expansion.json", import.meta.url), "utf8"));
const timeoutMs = Number(process.env.P0_SOURCE_LIVE_TIMEOUT_MS ?? 20000);

const checks = {
  uk_sanctions_list: { type:"xml", required:["UniqueID","PrimaryName"] },
  eu_sanctions_consolidated: { type:"any-structured", required:[] },
  world_bank_commodity_prices: { type:"xlsx", required:[] },
  unctadstat_global: { type:"html", required:[] },
  china_mofcom_trade_controls: { type:"html", required:["exportcontrol.mofcom.gov.cn"] },
  australia_critical_minerals: { type:"html", required:["Critical Minerals List","Strategic Materials List"] },
  cochilco_minerals: { type:"html", required:["Anuario de Estadísticas del Cobre y Otros Minerales"] },
  opcw_news: { type:"html", required:["News","OPCW"] },
  icj_cases: { type:"html", required:["Cases","International Court of Justice"] },
  icc_news: { type:"html", required:["News","International Criminal Court"] }
};

const runtimeExtractors = {
  china_mofcom_trade_controls: (text, retrievedAt) => parseMofcomExportControlHtml(text, { observedAt:retrievedAt }).length,
  australia_critical_minerals: (text, retrievedAt) => parseAustraliaCriticalMineralsHtml(text, { retrievedAt }).length,
  cochilco_minerals: (text, retrievedAt) => parseCochilcoAnuarioHtml(text, { retrievedAt }).value_numeric,
  opcw_news: (text, retrievedAt) => parseOpcwNewsHtml(text, { retrievedAt }).length,
  icj_cases: (text, retrievedAt) => parseIcjCasesHtml(text, { retrievedAt }).length,
  icc_news: (text, retrievedAt) => parseIccNewsHtml(text, { retrievedAt }).length
};

function structured(type, bytes, text, ct, url) {
  const lower = ct.toLowerCase();
  if (type === "xml") return (/xml/i.test(lower) || /\.xml(?:$|[?#])/i.test(url)) && /^\s*</.test(text);
  if (type === "xlsx") return bytes.length > 100 && bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (type === "any-structured") return /xml|csv|json|spreadsheet|excel|officedocument/i.test(lower) || /(?:\.xml|\.csv|\.json)(?:$|[?#])/i.test(url);
  if (type === "html") {
    if (!/html/i.test(lower) || !/<html|<body|<script|<!doctype/i.test(text)) return false;
    return true;
  }
  return false;
}

async function run(id, source) {
  const url = source.machine_endpoint ?? source.dataset_surface ?? source.discovery_url;
  const started = Date.now();
  const observedAt = new Date().toISOString();
  try {
    const res = await fetch(url, {
      redirect:"follow",
      signal:AbortSignal.timeout(timeoutMs),
      headers:{
        "user-agent":"Geomacro-P0-Live-Certification/1.0",
        "accept":"*/*"
      }
    });
    const bytes = new Uint8Array(await res.arrayBuffer());
    const ct = res.headers.get("content-type") ?? "";
    const text = /xml|csv|json|html|text/i.test(ct) ? new TextDecoder().decode(bytes) : "";
    const rule = checks[id];
    let extraction_count = null;
    let extraction_error = null;
    if (res.ok && text && runtimeExtractors[id]) {
      try {
        extraction_count = runtimeExtractors[id](text, observedAt);
      } catch (error) {
        extraction_error = error instanceof Error ? error.message : String(error);
      }
    }
    const runtimePass = !runtimeExtractors[id] || (Number(extraction_count) > 0 && !extraction_error);
    const requiredPass = (rule.required ?? []).every((marker) => text.includes(marker));
    const schemaPass = res.ok && structured(rule.type, bytes, text, ct, res.url) && requiredPass && runtimePass;
    return {
      source_id:id,
      status:res.status,
      ok:res.ok,
      schema_pass:schemaPass,
      content_type:ct,
      bytes:bytes.length,
      final_url:res.url,
      extraction_count,
      extraction_error,
      runtime_pass:runtimePass,
      latency_ms:Date.now()-started,
      observed_at:observedAt,
      note:schemaPass ? "transport/schema candidate passed" : "transport or schema validation failed"
    };
  } catch (error) {
    return {
      source_id:id,
      status:null,
      ok:false,
      schema_pass:false,
      content_type:null,
      bytes:0,
      final_url:null,
      extraction_count:null,
      extraction_error:error instanceof Error ? error.message : String(error),
      runtime_pass:false,
      latency_ms:Date.now()-started,
      observed_at:observedAt,
      note:error instanceof Error ? error.message : String(error)
    };
  }
}

const results = [];
for (const id of Object.keys(checks)) {
  results.push(await run(id, registry.p0_global_source_expansion.sources[id]));
}

const failed = results.filter((x) => !x.ok || !x.schema_pass);
const blockingFailures = failed.filter((row) => {
  const source = registry.p0_global_source_expansion.sources[row.source_id];
  return source?.enabled !== false;
});
console.log(JSON.stringify({
  mode:"READ_ONLY_LIVE_SCHEMA_CERTIFICATION",
  source_count:results.length,
  pass_count:results.length-failed.length,
  fail_count:failed.length,
  blocking_fail_count:blockingFailures.length,
  non_blocking_disabled_fail_count:failed.length-blockingFailures.length,
  results
}, null, 2));
process.exitCode = blockingFailures.length ? 1 : 0;
