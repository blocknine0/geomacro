import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {buildNamedCorridorSourceReadiness} from "../lib/corridor-source-readiness.mjs";
const fixture=JSON.parse(readFileSync(
  new URL("../../config/operator-corridor-source-crosswalk.v1.json", import.meta.url),"utf8"));
test("existing named routes produce a source-safe census without invented live flow",()=>{
 const r=buildNamedCorridorSourceReadiness(fixture);
 assert.equal(r.registry_source_count,20);
 assert.equal(r.named_corridor_count,58);
 assert.equal(r.monitor_references_total,178);
 assert.equal(r.monitor_refs_in_local_source_overlay+r.monitor_refs_outside_local_source_overlay,178);
 assert.equal(r.distinct_external_overlay_reference_ids.length,21);
 assert.equal(r.live_route_geometry_and_flow_certified,0);
 assert.equal(r.paid_named_corridor_delivery_verified,0);
 assert.equal(r.no_upstream_network_requests,true);
 assert.equal(r.no_payments,true);
 assert.equal(r.route_worklist.length,58);
 assert.ok(r.route_worklist.every(x=>x.verified_live_route_evidence===false &&
   x.route_geometry_certified===false && x.signed_corridor_delivery===false));
});
test("unlisted monitor identifiers stay visible as cross-overlay references, not fake certification",()=>{
 const j=structuredClone(fixture);
 j.corridors[0].monitor_refs.push({source_id:"fictional_source_id"});
 const r=buildNamedCorridorSourceReadiness(j);
 assert.equal(r.monitor_references_total,179);
 assert.ok(r.distinct_external_overlay_reference_ids.includes("fictional_source_id"));
 assert.equal(r.external_overlay_refs_are_not_proven_missing_globally,true);
 assert.equal(r.paid_named_corridor_delivery_verified,0);
});
test("duplicate or malformed source IDs, routes and monitor references fail closed",()=>{
 const duplicate=structuredClone(fixture);
 duplicate.source_registry.push({...duplicate.source_registry[0]});
 assert.throws(()=>buildNamedCorridorSourceReadiness(duplicate),/CORRIDOR_SOURCE_ENTRY_INVALID/);
 const routeDuplicate=structuredClone(fixture);
 routeDuplicate.corridors.push({...routeDuplicate.corridors[0]});
 assert.throws(()=>buildNamedCorridorSourceReadiness(routeDuplicate),/CORRIDOR_ROUTE_ENTRY_INVALID/);
 const unsafe=structuredClone(fixture);
 unsafe.corridors[0].monitor_refs.push({source_id:"https://untrusted.example/"});
 assert.throws(()=>buildNamedCorridorSourceReadiness(unsafe),/CORRIDOR_MONITOR_REFERENCE_INVALID/);
});
