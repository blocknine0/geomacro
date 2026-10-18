#!/usr/bin/env node
/**
 * Review worklist after Auto Ingest News: country mapping is a routing hint,
 * NOT evidence qualification or numerical GRI computation.
 */
import {readFileSync,mkdirSync,writeFileSync} from "node:fs";
import {buildMaterialGriCountryEvidenceWorklist} from "../lib/material-gri-country-evidence-worklist.mjs";
const raw=readFileSync("artifacts/derived-news/material-gri-review.json","utf8");
if(raw.length>175_000)throw Error("MATERIAL_GRI_SOURCE_QUEUE_OVERSIZE");
const reviewedQueue=JSON.parse(raw);
const registry=readFileSync("src/lib/canonical-country-registry-195.ts","utf8");
const worklist=buildMaterialGriCountryEvidenceWorklist(reviewedQueue,registry,Date.now());
mkdirSync("artifacts/derived-news",{recursive:true});
writeFileSync("artifacts/derived-news/material-gri-country-evidence-worklist.json",
  JSON.stringify(worklist,null,2),{mode:0o600,flag:"w"});
console.log(JSON.stringify({
 schema:"geomacro.material-gri-country-evidence-worklist-receipt.v1",
 categories:worklist.categories.map(x=>({category:x.category,
   candidates:x.review_targets.length,country_mapped:x.country_mapped,
   country_unresolved:x.geography_unresolved,
   within_6h_recheck_window:x.within_6h_original_recheck_window})),
 approved_signed_gri_input_ready:false,
 numerical_gri_scored:false,
 risk_indices_updated:false,
 source_raw_content_included:false,
 supabase_writes:0,payments:0,
}));
