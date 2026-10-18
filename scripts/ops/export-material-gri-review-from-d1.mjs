#!/usr/bin/env node
/**
 * Auto Ingest News: bounded read-only material GRI evidence watch.
 * Reads ONLY Geomacro's derived D1 public feed; zero source HTML/publisher
 * content, HTTP source retry, B2, GRO scoring, Supabase or customer payment.
 */
import {mkdirSync,writeFileSync} from "node:fs";
import {buildMaterialGriReviewFromDerivedD1} from "../lib/material-gri-news-review.mjs";
const ORIGIN="https://geomacro-control-plane.daspallab202391.workers.dev";
const url=ORIGIN+"/v1/public/website-derived-news";
const res=await fetch(url,{redirect:"error",cache:"no-store",
  signal:AbortSignal.timeout(12000)});
if(!res.ok||Number(res.headers.get("content-length")??0)>300000)
  throw Error("MATERIAL_GRI_D1_ORIGINAL_DERIVED_FEED_UNAVAILABLE");
const raw=await res.text();
if(raw.length>300000)throw Error("MATERIAL_GRI_D1_DERIVED_ONLY_BODY_OVERSIZE");
const parsed=JSON.parse(raw);
const queue=buildMaterialGriReviewFromDerivedD1(parsed,Date.now());
mkdirSync("artifacts/derived-news",{recursive:true});
writeFileSync("artifacts/derived-news/material-gri-review.json",
  JSON.stringify(queue,null,2),{encoding:"utf8",mode:0o600});
console.log(JSON.stringify({schema:"geomacro.material-gri-d1-review-receipt.v1",
  source_verified_as:"PREVIOUSLY_COLLECTED_D1_DERIVED_NEWS",
  categories:queue.categories.map(c=>({category:c.category,material_candidates:c.candidates_count})),
  original_reverified:false,gri_scored:false,independent_rights_verified:false,
  original_article_bytes_logged:false,payments:0,supabase:0}));
