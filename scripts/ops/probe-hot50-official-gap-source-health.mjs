/**
 * Read-only protected PR health audit of 23 three-domain official candidates.
 * Uses the same native-clock parser as scheduled production; no writes/keys/
 * original bytes, headlines or URLs are exported.
 */
import {writeFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {hot50ThreeCategoryOfficialPrioritySources} from "../lib/hot50-three-category-official-gap-priority.mjs";
import {collectPrivateOsint15m} from "../lib/private-osint-15m-collector.mjs";
import {privateOsintCountryMention} from "../lib/private-osint-country-mentions.mjs";
import {normalizeReusableNewsJson} from "../../src/lib/reusable-news-json.ts";
import {COUNTRIES_195} from "../../src/lib/canonical-country-registry-195.ts";
const now=new Date();
const registry=hot50ThreeCategoryOfficialPrioritySources();
const census=await collectPrivateOsint15m({now,registry,
 normalize:normalizeReusableNewsJson,
 resolveCountry:title=>privateOsintCountryMention(title,COUNTRIES_195),
 concurrency:6,
});
const byRef=new Map(census.checks.map(c=>[c.source_ref,c]));
const source_checks=registry.flatMap(s=>s.categories.map(category=>{
 const ref=createHash("sha256").update([s.id,s.url,category].join("\n")).digest("hex");
 const observed=byRef.get(ref);
 return {source_id:s.id,category,transport_state:observed?.state??"NOT_CHECKED",
  http_status:observed?.http_status??null,
  native_article_page_verified:false,commercial_rights_verified:false};
}));
const report={schema:"geomacro.hot50-three-category-first-party-readonly-probe.v1",
 checked_at:now.toISOString(),configured_sources:registry.length,
 category_checks:source_checks.length,source_checks,
 observed_native_item_counts_by_category:census.summary.selected_items_by_category,
 independent_same_event_corrob_verified:false,commercial_rights_verified:false,
 paid_risk_gate_eligible:false,publisher_raw_text_disclosed:false,
 d1_rows_written:0,b2_objects_written:0,
};
writeFileSync("/tmp/geomacro-hot50-official-gap-source-health.json",
 JSON.stringify(report,null,2),{mode:0o600});
console.log(JSON.stringify({schema:report.schema,configured_sources:report.configured_sources,
 category_checks:report.category_checks,states:Object.fromEntries(
 [...new Set(source_checks.map(x=>x.transport_state))].map(st=>[st,source_checks.filter(x=>x.transport_state===st).length])),
 commercial_rights_verified:false,paid_risk_gate_eligible:false,d1_rows_written:0}));
