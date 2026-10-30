import test from "node:test";
import assert from "node:assert/strict";
import {PRIVATE_OSINT_RETIRED_SOURCE_IDS,isRetiredPrivateOsintSource}
 from "./private-osint-retired-sources.mjs";
import {privateOsintGlobalSources} from "./private-osint-global-sources.mjs";
import {privateLocalPublisherCandidates,rotatingPrivateLocalPublisherSources}
 from "./private-osint-local-publisher-rotation.mjs";
import {privateOsintRuntimeSources} from "./private-osint-country-rotation.mjs";
import {COUNTRIES_195} from "../../src/lib/canonical-country-registry-195.ts";

test("76 repeatedly failing sources are retired from private production ingestion, not published or deleted from source history",()=>{
 assert.equal(PRIVATE_OSINT_RETIRED_SOURCE_IDS.length,76);
 const oldLocal=privateLocalPublisherCandidates();
 const retainedLocal=oldLocal.filter(s=>isRetiredPrivateOsintSource(s));
 assert.equal(retainedLocal.length,7);
 const sourceIds=new Set(privateOsintGlobalSources().map(s=>s.id));
 assert.ok(PRIVATE_OSINT_RETIRED_SOURCE_IDS.some(id=>!sourceIds.has(id)));
 for(const id of PRIVATE_OSINT_RETIRED_SOURCE_IDS)
  assert.equal(sourceIds.has(id),false,id);
 for(let n=0;n<8;n++){
  const now=new Date(Date.parse("2026-10-31T00:00:00Z")+n*900000);
  const local=rotatingPrivateLocalPublisherSources(now);
  assert.equal(local.length,24);
  assert.ok(local.every(source=>!isRetiredPrivateOsintSource(source)));
  const registry=privateOsintRuntimeSources(now,undefined,COUNTRIES_195,{includeLocalGapLane:true});
  assert.ok(registry.length<=512);
  assert.equal(new Set(registry.map(s=>s.url)).size,registry.length);
  assert.ok(registry.every(s=>!isRetiredPrivateOsintSource(s)));
  assert.equal(registry.filter(s=>s.private_discovery_index_only).length,25);
  assert.equal(registry.filter(s=>s.private_hub_overlay).length,3);
 }
});
