#!/usr/bin/env bun
/** Offline, deterministic routing coverage matrix. Never converts country
 * directory entries into actual provider observations, source rights or
 * signed customer answers. Safe to publish as a redacted CI artifact.
 */
import {mkdirSync,writeFileSync} from "node:fs";
import {buildCanonical195x3CoverageMatrix} from "../../src/lib/canonical-195-country-coverage-matrix";
const result=buildCanonical195x3CoverageMatrix();
if(result.country_count!==195||result.cell_count!==585)
 throw Error("CANONICAL_195_COUNTRY_MATRIX_COUNT_DRIFT");
const directory="artifacts/country-195";
mkdirSync(directory,{recursive:true});
writeFileSync(directory+"/routing-matrix.v1.json",
 JSON.stringify(result,null,2)+"\n",{mode:0o600});
console.log(JSON.stringify({
 schema:result.schema,country_registry_version:result.country_registry_version,
 country_count:result.country_count,category_count:result.category_count,
 cell_count:result.cell_count,routing_verified:result.routing_verified_counts,
 live_source_verified:result.live_source_verified_counts,
 current_evidence_verified:result.current_evidence_verified_counts,
 signed_delivery_verified:result.signed_delivery_verified_counts,
 evidence_unprobed:true,no_persistent_source_data:true,
 x402_payment_authorized:false,
}));
