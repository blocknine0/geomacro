import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
const manifest=JSON.parse(readFileSync("docs/ops/SUPABASE_ALL_174_TABLES_READONLY_CROSSCHECK_20261020.json","utf8"));
describe("actual live Supabase 174 physical-table lossless cutover baseline",()=>{
 it("inventories every actual schema/PK without data, customer secrets or sample rows",()=>{
   expect(manifest.schema).toBe("geomacro.supabase-live-table-schema-manifest.v1");
   expect(manifest.schema_counts).toEqual({public:139,auth:27,storage:8});
   expect(manifest.tables).toHaveLength(174);
   expect(new Set(manifest.tables.map((r:any)=>r.schema+"."+r.table)).size).toBe(174);
   expect(manifest.tables.every((r:any)=>Array.isArray(r.primary_key_columns)&&r.primary_key_columns.length>0)).toBe(true);
   expect(manifest.metadata_only).toBe(true);
   expect(manifest.customer_rows_exported).toBe(false);
   expect(manifest.plaintext_secrets_exported).toBe(false);
 });
 it("prevents misleading full migration / deletion sign-off",()=>{
   expect(manifest.d1_import_performed).toBe(false);
   expect(manifest.legacy_data_deletion_authorized).toBe(false);
   expect(manifest.tables.every((r:any)=>r.hash_readback_verified===false&&
      r.destination_acceptance==="NOT_VERIFIED"&&r.old_data_delete_authorized===false)).toBe(true);
 });
 it("preserves critical revenue, GRO, evidence and original-source directory ownership",()=>{
   const entry=(s:string)=>manifest.tables.find((x:any)=>x.schema==="public"&&x.table===s);
   for(const n of ["geomacro_risk_objects","live_external_observations","live_raw_source_snapshots",
     "commercial_api_credentials","commercial_payment_events","coinbase_x402_deliveries",
     "live_country_statistics_source_directory","live_country_critical_mineral_source_directory"]){
      expect(entry(n)).toBeDefined();
      expect(entry(n).primary_key_columns.length).toBeGreaterThan(0);
   }
 });
});
