#!/usr/bin/env node
/** A single COUNT(*) D1 metadata diagnostic: no article, publisher or source bytes.
 * Only an authenticated D1 Free-headroom-checked maintenance sweep may repair
 * >600-row journal. The normal writer's immutable original clocks and
 * substantive-over-candidate priority policy still decide retention.
 */
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
export function inspectDerivedJournalCount(raw){
 if(!Array.isArray(raw)||raw.length!==1||raw[0]?.success!==true||
    !Array.isArray(raw[0]?.results)||raw[0].results.length!==1||
    !Number.isSafeInteger(raw[0].results[0]?.journal_rows)||
    raw[0].results[0].journal_rows<0)
    throw Error("DERIVED_NEWS_D1_ROW_COUNT_UNVERIFIED");
 const total=raw[0].results[0].journal_rows;
 return Object.freeze({row_count:total,over_capacity:total>600});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  if(process.argv.length!==3)throw Error("DERIVED_JOURNAL_ARG_INVALID");
  const out=inspectDerivedJournalCount(JSON.parse(readFileSync(process.argv[2],"utf8")));
  console.log(JSON.stringify({schema:"geomacro.derived-news-overcap-d1-diagnostic.v1",
    journal_row_count:out.row_count,needs_one_maintenance_sweep:out.over_capacity,
    source_content_read:false,counts_only:true}));
  if(process.env.GITHUB_OUTPUT){
   const {appendFileSync}=await import("node:fs");
   appendFileSync(process.env.GITHUB_OUTPUT,"overcap="+out.over_capacity+"\n");
  }
 }catch{
  console.error("DERIVED_NEWS_D1_ROW_COUNT_UNVERIFIED");process.exitCode=2;
 }
}
