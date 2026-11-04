/** Read-only source-specific HTTP/native-date audit of official alternate feeds.
 * No publisher raw content or URLs are written to the artifact. Failed HTTP
 * 403/429 remains FAILED; separate original publishers stay independent.
 */
import {writeFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {macroMineralsContinuitySources} from "../lib/macro-minerals-continuity-sources.mjs";
import {collectPrivateOsint15m} from "../lib/private-osint-15m-collector.mjs";
import {privateOsintCountryMention} from "../lib/private-osint-country-mentions.mjs";
import {normalizeReusableNewsJson} from "../../src/lib/reusable-news-json.ts";
import {COUNTRIES_195} from "../../src/lib/canonical-country-registry-195.ts";
const registry=macroMineralsContinuitySources(), now=new Date();
const receipt=await collectPrivateOsint15m({now,registry,
 normalize:normalizeReusableNewsJson,
 resolveCountry:title=>privateOsintCountryMention(title,COUNTRIES_195),
 concurrency:4});
const byRef=new Map(receipt.checks.map(c=>[c.source_ref,c]));
const checks=registry.map(s=>{
 const ref=createHash("sha256").update([s.id,s.url,s.categories[0]].join("\n")).digest("hex");
 const observed=byRef.get(ref);
 return {source_id:s.id,category:s.categories[0],
  transport_state:observed?.state??"NOT_CHECKED",
  http_status:observed?.http_status??null,
  independent_original_page_verified:false};
});
const report={schema:"geomacro.macro-minerals-continuity-readonly-probe.v1",
 checked_at:now.toISOString(),sources_configured:registry.length,
 by_category:{macro:6,rare_earth:4},
 source_checks:checks,
 collector_source_states:receipt.summary.source_states,
 factual_items_25h:receipt.summary.selected_items_by_category,
 transport_verified_for_every_feed:checks.every(c=>["OBSERVED","EMPTY_OR_OUTSIDE_WINDOW"].includes(c.transport_state)),
 original_page_verified:false,rights_verified:false,paid_eligible:false,
 d1_writes:0,b2_writes:0};
writeFileSync("/tmp/geomacro-macro-minerals-continuity-readonly.json",
 JSON.stringify(report,null,2),{mode:0o600});
console.log(JSON.stringify(report));
