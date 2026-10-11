import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  auditFreeCountryGaps,canonicalGeographicDenominator,DOMAINS,
} from "../ops/audit-free-three-domain-country-gaps.mjs";

const source=readFileSync("src/lib/global-entity-classification.ts","utf8");
const canonical=canonicalGeographicDenominator(source);
const now=new Date("2026-10-11T08:30:00.000Z");
const json=results=>[{success:true,results}];
const cells=()=>{
  const out=[];
  for(const code of canonical.keys())for(const domain of DOMAINS)
    out.push({
      country_code:code,domain,readiness_status:"PRODUCTION_READY",
      certified_source_count:1,review_source_count:0,
      unavailable_source_count:0,
      last_verified_at:"2026-10-11T08:00:00.000Z",
    });
  return out;
};

test("canonical geography denominator is precisely 194 sovereign + 53 territory + 3 special; never 250 sovereign",()=>{
  assert.equal(canonical.size,250);
  assert.equal([...canonical.values()].filter(x=>x==="SOVEREIGN").length,194);
  assert.equal([...canonical.values()].filter(x=>x==="TERRITORY").length,53);
  assert.equal([...canonical.values()].filter(x=>x==="SPECIAL_ENTITY").length,3);
  assert.equal(canonical.get("USA"),"SOVEREIGN");
  assert.equal(canonical.get("TWN"),"SPECIAL_ENTITY");
});

test("complete current synthetic D1 SOURCE METADATA never becomes licensed news, GRO or paid coverage",()=>{
  const actual=auditFreeCountryGaps({d1Json:json(cells()),classificationSource:source,now});
  assert.equal(actual.target_geography_category_cells,750);
  assert.equal(actual.gap_count,0);
  assert.equal(actual.metadata_country_floor_met,true);
  assert.equal(actual.recent_source_metadata_floor_met,true);
  for(const domain of DOMAINS){
    assert.equal(actual.domains[domain].metadata_rows_present,250);
    assert.equal(actual.domains[domain].recent_verified_metadata_90m,250);
  }
  for(const key of [
    "rights_verified_per_country",
    "independent_same_event_corroboration_per_country",
    "original_article_native_time_per_country_verified",
    "current_signed_risk_intelligence_195x3_verified",
    "x402_global_coverage_chargeable",
  ]) assert.equal(actual[key],false);
  assert.equal(actual.d1_writes+actual.b2_requests+actual.supabase_reads+actual.supabase_writes+
    actual.telegram_requests+actual.model_calls,0);
});

test("no production metadata reports every missing 250x3 slot rather than fake coverage",()=>{
  const actual=auditFreeCountryGaps({d1Json:json([]),classificationSource:source,now});
  assert.equal(actual.gap_count,750);
  assert.equal(actual.recent_source_metadata_floor_met,false);
  assert.equal(actual.metadata_country_floor_met,false);
  assert.equal(actual.missing_or_stale_source_metadata_cells.length,750);
  assert.equal(actual.missing_or_stale_source_metadata_cells[0].blocker,"NO_COUNTRY_DOMAIN_METADATA");
});

test("expired and unlicensed SOURCE METADATA independently block per-category ISO3",()=>{
  const rows=cells();
  const usaMacro=rows.find(x=>x.country_code==="USA"&&x.domain==="macro");
  usaMacro.last_verified_at="2026-10-10T01:00:00.000Z";
  const indGeo=rows.find(x=>x.country_code==="IND"&&x.domain==="geopolitics");
  indGeo.certified_source_count=0;
  const vatMineral=rows.find(x=>x.country_code==="VAT"&&x.domain==="rare_earth");
  rows.splice(rows.indexOf(vatMineral),1);
  const actual=auditFreeCountryGaps({d1Json:json(rows),classificationSource:source,now});
  assert.equal(actual.gap_count,3);
  assert.deepEqual(actual.missing_or_stale_source_metadata_cells
      .map(x=>[x.iso3,x.domain,x.blocker]).sort(),
    [
      ["USA","macro","SOURCE_METADATA_NOT_RECENT_90M"],
      ["IND","geopolitics","NO_CERTIFIED_SOURCE_METADATA"],
      ["VAT","rare_earth","NO_COUNTRY_DOMAIN_METADATA"],
    ].sort());
  assert.equal(actual.domains.macro.recent_verified_metadata_90m,249);
  assert.equal(actual.domains.rare_earth.missing_metadata_rows,1);
  assert.equal(actual.domains.geopolitics.review_only_or_missing,1);
});

test("dangerous malformed, unknown, duplicate and future D1 claims always fail closed",()=>{
  const base=cells();
  const badRows=[
    [...base,{...base[0]}],
    [{...base[0],country_code:"ZZZ"}],
    [{...base[0],domain:"telegram"}],
    [{...base[0],certified_source_count:-1}],
    [{...base[0],certified_source_count:"bad"}],
    [{...base[0],readiness_status:"VERIFIED\nUNSAFE"}],
    [{...base[0],last_verified_at:"2026-10-11T09:30:00.000Z"}],
    Array.from({length:801},()=>({...base[0]})),
  ];
  for(const rows of badRows)
    assert.throws(()=>auditFreeCountryGaps({d1Json:json(rows),classificationSource:source,now}),
      /FREE_COUNTRY_GAP_/);
  for(const d1Json of ['not-json',{},[{success:false,results:[]}],[]])
    assert.throws(()=>auditFreeCountryGaps({d1Json,classificationSource:source,now}),
      /FREE_COUNTRY_GAP_/);
  assert.throws(()=>canonicalGeographicDenominator("const SOVEREIGN_ISO3 = new Set([]);"),
    /FREE_COUNTRY_GAP_/);
});

test("public receipt contains only ISO3 and status; never raw original publisher article, source URL or hashes",()=>{
  const actual=auditFreeCountryGaps({d1Json:json([cells()[0]]),classificationSource:source,now});
  const encoded=JSON.stringify(actual);
  for(const needle of ["source_url","publisher_url","raw_article","message_text","TELEGRAM_SESSION",
    "review_signature_base64","https://","B2_KEY_ID"])
    assert.equal(encoded.includes(needle),false);
  assert.equal(actual.current_signed_risk_intelligence_195x3_verified,false);
  assert.equal(actual.x402_global_coverage_chargeable,false);
});
