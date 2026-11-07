import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {STORAGE_LOCATION_SQL,OPERATIONAL_MODEL_SQL,
 readStorageLocation,readOperationalModel}
 from "../../workers/control-plane/src/operational-read-model.mjs";
const SHA="a".repeat(64),now=1762530000000;
const payload={schema:"geomacro.operational-read-model.v1",
 scope:"INTERNAL_OBSERVABILITY",model_key:"source_health_hot50",
 source_revision_sha256:SHA,source_count:50};
function fixture(result){const calls=[];return {calls,DB:{prepare(sql){calls.push(sql);
 return {bind(key){calls.push(key);return {async first(){return result}}}}}}};}
test("point-lookups never scan journals, joins or group counts",()=>{
 for(const sql of [STORAGE_LOCATION_SQL,OPERATIONAL_MODEL_SQL]){
  assert.match(sql,/WHERE [a-z_]+=?\? LIMIT 1/);
  assert.doesNotMatch(sql,/COUNT\(|JOIN\b|GROUP BY|OFFSET|SELECT \*/i);
 }
});
test("locations are symbolic until independently provider-verified",async()=>{
 const f=fixture({provider:"cloudflare_d1",symbolic_locator:"DB",
  authority_role:"METADATA_AND_INDEX_AUTHORITY",verification_state:"EXPECTED_NOT_VERIFIED"});
 assert.equal((await readStorageLocation(f,"canonical_control_metadata")).may_route_to_store,false);
 assert.equal(f.calls[0],STORAGE_LOCATION_SQL);
 assert.equal((await readStorageLocation(f,"../exfiltration")),null);
});
test("materialized model serves only fresh revision-checked safe diagnostic",async()=>{
 const f=fixture({scope:"INTERNAL_OBSERVABILITY",source_revision_sha256:SHA,
  payload_json:JSON.stringify(payload),updated_at_ms:now-1000,expires_at_ms:now+10000});
 const r=await readOperationalModel(f,"source_health_hot50",{
  scope:"INTERNAL_OBSERVABILITY",expectedRevision:SHA,now});
 assert.equal(r.ok,true);assert.equal(r.authorizes_payment,false);
 assert.equal(r.certifies_b2_physical_parity,false);
 assert.equal(await readOperationalModel(f,"source_health_hot50",{
  scope:"INTERNAL_OBSERVABILITY",expectedRevision:"b".repeat(64),now}),null);
 assert.equal(await readOperationalModel(f,"source_health_hot50",{
  scope:"INTERNAL_OBSERVABILITY",expectedRevision:SHA,now:now+4000000}),null);
});
test("no fabricated status when read model missing or schema missing",async()=>{
 assert.equal(await readOperationalModel(fixture(null),"source_health_hot50",{
  scope:"INTERNAL_OBSERVABILITY",expectedRevision:SHA,now}),null);
 assert.equal(await readOperationalModel(fixture({}),"source_health_hot50",{
  scope:"INTERNAL_OBSERVABILITY",expectedRevision:SHA,now}),null);
});
test("catalog contains only expected bindings and must not claim live proof",()=>{
 const cat=JSON.parse(readFileSync(new URL("../../config/geomacro-storage-location-directory.v1.json",import.meta.url)));
 assert.equal(cat.schema,"geomacro.storage-location-directory.v1");
 assert.equal(cat.verification,"REPOSITORY_EXPECTED_NOT_PROVIDER_INVENTORY");
 assert.ok(cat.stores.length>=6);
 for(const store of cat.stores){
  assert.equal(store.verified_live,false);
  assert.match(store.symbolic_locator,/^[A-Z][A-Z0-9_]+$/);
 }
 const sql=readFileSync(new URL("../../docs/ops/staged-migrations/0212_storage_directory_read_model.sql",import.meta.url),"utf8");
 assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS geomacro_storage_locator_v1"));
 assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS geomacro_operational_read_model_v1"));
 assert.ok(!sql.includes("FROM ingestion_spool_queue"));
});
