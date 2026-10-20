#!/usr/bin/env node
// Pure catalog audit. This emits NO upstream feed requests, no event/flow risk,
// and no commercial certification. Used by the existing source-intake schedule.
import {readFileSync,mkdirSync,writeFileSync} from "node:fs";
import {buildNamedCorridorSourceReadiness} from "../lib/corridor-source-readiness.mjs";
const catalog=JSON.parse(readFileSync(
  new URL("../../config/operator-corridor-source-crosswalk.v1.json",import.meta.url),"utf8"));
const receipt=buildNamedCorridorSourceReadiness(catalog);
const path="artifacts/private-intake/named-corridor-source-readiness.json";
mkdirSync("artifacts/private-intake",{recursive:true,mode:0o700});
writeFileSync(path,JSON.stringify(receipt,null,2)+"\n",{mode:0o600});
// Only aggregate metrics in operator logs, never publisher payloads or credentials.
console.log(JSON.stringify({
 schema:receipt.schema,named_corridors:receipt.named_corridor_count,
 local_source_entries:receipt.registry_source_count,
 refs_outside_corridor_overlay:receipt.monitor_refs_outside_local_source_overlay,
 unique_external_overlay_references:receipt.distinct_external_overlay_reference_ids.length,
 live_routes_certified:receipt.live_route_geometry_and_flow_certified,
 paid_routes_certified:receipt.paid_named_corridor_delivery_verified,
 no_upstream_network_requests:true,payments:0
}));
