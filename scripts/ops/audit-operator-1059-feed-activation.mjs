#!/usr/bin/env node
/** Uses the existing bounded 90-minute operator source GET receipt.
 * This NEVER performs a provider fetch, publishes source names or enables
 * a held Telegram or third-party feed. For operator-only observation.
 */
import {readFileSync,mkdirSync,writeFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {resolve} from "node:path";
import {gatherPrivateIntakeSnapshot} from "./assemble-private-all-source-intake.mjs";
import {auditGeomacro1059FeedActivation}
  from "../lib/geomacro-feed-activation-ledger.mjs";

const IN="artifacts/expanded-official-source/operator-free-feed-rotation.json";
const OUT="artifacts/expanded-official-source/1059-feed-activation-audit.json";
export async function produceOperator1059ActivationReceipt({
  receipt,inventory,operatorCatalog,now=new Date(),
}={}){
  if(!receipt||!inventory||!operatorCatalog)throw Error("SOURCE_ACTIVATION_AUDIT_INPUT_MISSING");
  return auditGeomacro1059FeedActivation({
    inventory,operatorCatalog,rotationReceipts:[receipt],now,
  });
}
async function main(){
  if(process.argv.length!==2)throw Error("SOURCE_ACTIVATION_AUDIT_INPUT_MISSING");
  const [inventory,operatorCatalog]=await Promise.all([
    gatherPrivateIntakeSnapshot(),
    Promise.resolve(JSON.parse(readFileSync(
      "config/operator-76-source-attribution-intake.v1.json","utf8"))),
  ]);
  const receipt=JSON.parse(readFileSync(IN,"utf8"));
  const report=await produceOperator1059ActivationReceipt({
    receipt,inventory,operatorCatalog,
  });
  mkdirSync("artifacts/expanded-official-source",{recursive:true});
  writeFileSync(OUT,JSON.stringify(report)+"\n",{mode:0o600});
  // Operator workflow log ONLY aggregates; source/provider IDs never leave
  // hashed internal inventory and upstream receipt private artifact.
  console.log(JSON.stringify({
    schema:report.schema,
    catalogued_domain_lane_references:report.catalogued_domain_lane_references,
    requested_active_feed_target_80pct:report.requested_active_feed_target_80pct,
    observed_rotating_groups:report.observed_rotating_groups,
    distinct_live_xml_feed_transports_proven:
      report.distinct_live_xml_feed_transports_proven,
    missing_physical_live_feed_target_count:
      report.missing_physical_live_feed_target_count,
    existing_reference_semantics_allow_80pct:
      report.existing_reference_semantics_allow_80pct,
    all_catalogued_entries_are_active_feeds:false,
    x402_payment_authorized:false,
  }));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main().catch(()=>{
    console.error("SOURCE_ACTIVATION_AUDIT_FAILED");
    process.exitCode=2;
  });
}
