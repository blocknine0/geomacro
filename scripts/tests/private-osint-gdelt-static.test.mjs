import test from "node:test";
import assert from "node:assert/strict";
import {privateGdeltGlobalDiscovery,summarizeGdeltEventsStaticCsv}
 from "../lib/private-osint-gdelt-global.mjs";
const now=new Date("2026-11-04T01:00:00.000Z");
const batch_at="2026-11-04T00:45:00.000Z";
const row=new Array(61).fill("");
row[0]="123456789";row[28]="14";row[30]="-8.5";
row[53]="IN";row[59]="20261104004500";
row[60]="https://example.org/original-report";
const events=row.join("\t")+"\n";
test("GDELT 61-column static Event stream is source-indexed, not falsely ISO3-attributed",()=>{
 const summary=summarizeGdeltEventsStaticCsv(events,{batch_at,now});
 assert.equal(summary.scanned_event_rows,1);
 assert.equal(summary.distinct_valid_event_ids,1);
 assert.equal(summary.geopolitics_conflict_event_hints,1);
 assert.equal(summary.distinct_gdelt_fips_geo_codes,1);
 assert.equal(summary.publisher_original_date_verified,false);
 assert.equal(summary.iso3_event_country_verified,false);
 assert.equal(JSON.stringify(summary).includes("example.org"),false);
});
test("manifest-verified static Events + GKG replace DOC without emitting publisher text",async()=>{
 const gkg=new Array(27).fill("");
 gkg[1]="20261104004500";gkg[4]="https://example.org/macro";
 gkg[7]="INFLATION;";const content=gkg.join("\t")+"\n";
 const called=[];
 const result=await privateGdeltGlobalDiscovery({
  now,resolveCountry:()=>null,fetchImpl:async()=>{throw Error("DOC_API_SHOULD_NOT_BE_USED");},
  readArchive:async({kind})=>{
   called.push(kind);
   return {decoded:kind==="events"?events:content,
    manifest:{batch_at},manifest_route:"LASTUPDATE"};
  },
 });
 assert.deepEqual(called.sort(),["events","gkg"]);
 assert.equal(result.transport,"STATIC_LASTUPDATE_MD5_VERIFIED_ZIP");
 assert.equal(result.static_events_integrity_verified,true);
 assert.equal(result.static_gkg_integrity_verified,true);
 assert.equal(result.conflict_event_hints,1);
 assert.equal(result.checks.find(x=>x.category==="macro").index_metadata_hints,1);
 assert.equal(result.commercial_rights_verified,false);
 assert.equal(result.source_publisher_clock_verified,false);
 assert.equal(result.original_article_urls_or_titles_emitted,false);
});
