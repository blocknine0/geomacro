#!/usr/bin/env node
import { createHash } from "node:crypto";
import { parseUkSanctionsXml } from "../global-intelligence/adapters/uk-sanctions-list.mjs";
import { normalizeCommodityRow } from "../global-intelligence/adapters/world-bank-commodity-prices.mjs";
import { normalizeEuSanctionsRecord } from "../global-intelligence/adapters/eu-sanctions.mjs";
import { normalizeUnctadStatObservation } from "../global-intelligence/adapters/unctadstat.mjs";
import { normalizeMofcomExportControl } from "../global-intelligence/adapters/china-mofcom.mjs";
import { normalizeAustraliaCriticalMineral } from "../global-intelligence/adapters/australia-critical-minerals.mjs";
import { normalizeCochilcoObservation } from "../global-intelligence/adapters/cochilco-minerals.mjs";

function assert(condition, message) { if (!condition) throw new Error(message); }
function checkBase(o) {
  for (const key of ["source_id","source_record_id","category","observed_at","source_url","metric","event_type","signal_type","provenance","raw_hash"]) assert(o[key], key + " missing");
  assert(/^[a-f0-9]{64}$/.test(o.raw_hash), "raw_hash must be sha256");
  assert(/^https?:\/\//.test(o.source_url), "source_url invalid");
}
function checkDeterministic(factory) {
  const a=factory(), b=factory();
  assert(a.source_record_id===b.source_record_id, "record id not deterministic");
  assert(a.raw_hash===b.raw_hash, "raw hash not deterministic");
}
function checkNoFuturePublished(o) {
  if (!o.published_at) return;
  assert(new Date(o.published_at).getTime() <= new Date(o.observed_at).getTime(), "published_at is after observed_at");
}
const observedAt="2026-09-24T00:00:00.000Z";
const cases=[
  () => parseUkSanctionsXml("<Designations><Designation><UniqueID>UK001</UniqueID><PrimaryName>Example</PrimaryName><RegimeName>Example Regime</RegimeName><LastUpdated>2026-09-20</LastUpdated></Designation></Designations>",{observedAt})[0],
  () => normalizeCommodityRow({commodity:"Copper",period:"2026-08",value:123.45,unit:"USD/mt",retrievedAt:observedAt}),
  () => normalizeEuSanctionsRecord({id:"EU001",name:"Example",regime:"Example Regime",designationDate:"2026-09-20",retrievedAt:observedAt}),
  () => normalizeUnctadStatObservation({dataset:"trade",series:"Exports",period:"2026-08",value:42.5,unit:"USD million",countryIso3:"CHN",retrievedAt:observedAt}),
  () => normalizeMofcomExportControl({id:"MO001",title:"Rare earth export control",issuedAt:"2026-09-20",commodity:"Rare earths",retrievedAt:observedAt}),
  () => normalizeAustraliaCriticalMineral({mineral:"Lithium",retrievedAt:observedAt}),
  () => normalizeCochilcoObservation({series:"Mine copper production",period:"2026-07",value:400.3,unit:"kt",commodity:"Copper",retrievedAt:observedAt})
];
const out=cases.map(factory=>factory());
for (const [i,o] of out.entries()) {
  checkBase(o);
  checkNoFuturePublished(o);
  checkDeterministic(cases[i]);
}
const ids=new Set(out.map(o=>o.source_record_id));
assert(ids.size===out.length,"source_record_id collision");
const categoryCounts=out.reduce((m,o)=>(m[o.category]=(m[o.category]||0)+1,m),{});
console.log(JSON.stringify({status:"PASS",certification:["schema","freshness","provenance","deterministic_id","deterministic_hash","collision_check"],sources:out.map(o=>o.source_id),categoryCounts,fixtureDigest:createHash("sha256").update(out.map(o=>o.raw_hash).join("|")).digest("hex")},null,2));
