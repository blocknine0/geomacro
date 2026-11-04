import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fourLaneOpenSourceRightsInventory}
 from "./four-lane-free-source-rights.mjs";
const i=()=>fourLaneOpenSourceRightsInventory();
test("all four intelligence lanes bind to concrete existing adapters, with no new polling or live-coverage claim",()=>{
 const x=i();
 assert.equal(x.providers.length,25);
 assert.deepEqual(x.lane_counts,{geopolitics:5,macro:9,rare_earth:5,corridor:6});
 assert.equal(x.actual_source_fetches,0);
 assert.equal(x.actual_d1_writes,0);
 assert.equal(x.actual_b2_put_get_readbacks,0);
 assert.equal(x.extra_provider_pollers_added,0);
 assert.equal(x.commercial_risk_gate_qualified,0);
 assert.equal(x.rights_or_live_proof_inferred,false);
});
test("GDELT and public government datasets are not publisher-news licenses or commercial paid risk gate approval",()=>{
 const x=i(),get=id=>x.providers.find(s=>s.id===id);
 assert.equal(get("gdelt_project_gkg").rights_class,"OPEN_WITH_ATTRIBUTION");
 assert.match(get("gdelt_project_gkg").limitations,/article bodies retain publisher rights/i);
 assert.equal(get("ofac_sdn_public_dataset").ingestion_state,"CATALOGUED_NOT_POLLING");
 assert.equal(get("ofac_sdn_public_dataset").source_only_factual_metadata_allowed,false);
 assert.equal(get("usgs_mineral_data").rights_class,"US_PUBLIC_DOMAIN_GOV_WORKS");
 assert.equal(get("world_bank_indicators").rights_class,"OPEN_WITH_ATTRIBUTION_SUBSET");
 assert.equal(get("imf_public_series").rights_class,"PUBLISHER_REVIEW_REQUIRED");
 assert.equal(get("bis_central_bank_speeches").rights_class,"PUBLISHER_REVIEW_REQUIRED");
 assert.equal(get("wto_trade_notices").rights_class,"PUBLISHER_REVIEW_REQUIRED");
 assert.equal(get("ukmto_maritime_advisories").rights_class,"PUBLISHER_REVIEW_REQUIRED");
 assert.ok(x.providers.every(s=>s.paid_risk_gate_eligible===false));
});
test("no account-free or provider-restricted API is enabled without actual eligibility",()=>{
 const x=i(),get=id=>x.providers.find(s=>s.id===id);
 assert.equal(get("trading_economics").ingestion_state,"HOLD_NOT_FREE");
 assert.equal(get("marinetraffic_ais").ingestion_state,"HOLD_NOT_FREE");
 assert.equal(get("aishub_ais").ingestion_state,"HOLD_PROVIDER_ELIGIBILITY");
 assert.equal(get("eia_energy_api").ingestion_state,"CREDENTIAL_GATED");
 assert.equal(get("bls_official_indicators").ingestion_state,"CREDENTIAL_GATED");
 assert.ok(x.providers.filter(s=>["CREDENTIAL_GATED","CATALOGUED_NOT_POLLING",
  "HOLD_NOT_FREE","HOLD_PROVIDER_ELIGIBILITY"].includes(s.ingestion_state))
   .every(s=>s.source_only_factual_metadata_allowed===false));
 assert.equal(x.ingestion_states.EXISTING_PRIVATE_FEED_COLLECTOR,5);
 assert.equal(x.ingestion_states.EXISTING_READ_ONLY_OBSERVER,10);
 assert.equal(x.ingestion_states.EXISTING_STRUCTURAL_REFERENCE_ADAPTER,4);
 assert.equal(x.paid_apis_activated,0);
});
test("existing 20-minute production original collector retains source-only writer, free governor and 72h AEAD backlog",()=>{
 const s=readFileSync(new URL("../../.github/workflows/hot50-direct-original-news-20m.yml",import.meta.url),"utf8");
 assert.match(s,/cron:\s*["']6,26,46 \* \* \* \*["']/u);
 assert.match(s,/scripts\/ops\/plan-d1-bundled-work\.mjs/u);
 assert.match(s,/scripts\/ops\/phase2i-source-only-raw-tick\.ts/u);
 assert.match(s,/geomacro-private-phase2i-72h-ciphertext/u);
 assert.match(s,/geomacro-permanent-news-publication/u);
 assert.match(s,/four-lane-free-source-rights\.test\.mjs/u);
});
