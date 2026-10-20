import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {validateSupabaseDirectoryRows,DATASETS,migrateShadow}
 from "../../scripts/ops/migrate-supabase-official-source-directories-d1-shadow.mjs";
const sampleRows=()=>{
 const codes=Array.from({length:194},(_,i)=>"ABCDEFGHJKLMNPQRSTUVWXYZ".at(Math.floor(i/24)%24)+
  "ABCDEFGHJKLMNPQRSTUVWXYZ".at(i%24));
 // The test must use real unique 2-character ISO-shaped codes, no real
 // source URL or customer content.
 const iso=[...new Set(codes)].slice(0,194);
 if(iso.length!==194)throw Error("TEST_ISO_GENERATOR_INVALID");
 const source=[...iso,"VA"];
 return DATASETS.flatMap(dataset=>source.filter(code=>dataset!=="statistics"||code!=="VA")
  .map(iso2=>JSON.stringify({dataset,iso2,row:{
    country_iso2:iso2,verification_state:"UNVERIFIED",
    source_url:"https://example.invalid/"+iso2,
  }})));
};
describe("owner-only legacy Supabase official source directories to private D1",()=>{
 it("requires exactly 195/194/195/195, stable counts, no activation",()=>{
  const report=validateSupabaseDirectoryRows(sampleRows());
  expect(report.counts).toEqual({primary:195,statistics:194,monetary:195,critical_minerals:195});
  expect(report.missing_statistics_iso2).toEqual(["VA"]);
  expect(report.sources_activated).toBe(false);
  expect(report.rows).toHaveLength(779);
  expect(report.manifest_sha256).toMatch(/^[a-f0-9]{64}$/);
 });
 it("rejects duplicate, spoofed country or missing actual directories",()=>{
  const rows=sampleRows();
  expect(()=>validateSupabaseDirectoryRows([...rows,rows[0]])).toThrow();
  expect(()=>validateSupabaseDirectoryRows(rows.slice(1))).toThrow();
  const altered=[...rows];
  altered[0]=JSON.stringify({dataset:"primary",iso2:"A1",
    row:{country_iso2:"A1"}});
  expect(()=>validateSupabaseDirectoryRows(altered)).toThrow();
 });
 it("cannot silently create a fabricated statistical office for missing VA",()=>{
  const rows=sampleRows().filter(s=>!(s.includes('"dataset":"statistics"')&&s.includes('"iso2":"AA"')));
  expect(()=>validateSupabaseDirectoryRows(rows)).toThrow();
 });
 it("rejects credential-shaped source schema keys before private D1 transfer",()=>{
  const rows=sampleRows(),r=JSON.parse(rows[0]);
  r.row.private_key="unsafe";
  rows[0]=JSON.stringify(r);
  expect(()=>validateSupabaseDirectoryRows(rows)).toThrow();
 });
 it("never performs even a Supabase read before protected owner ACK",async()=>{
  await expect(migrateShadow()).rejects.toThrow("LEGACY_SOURCE_DIRECTORY_SHADOW_RECONCILIATION_FAILED");
 });
 it("strictly no public / paid / B2 / delete paths in migration",()=>{
  const migration=readFileSync("scripts/ops/migrate-supabase-official-source-directories-d1-shadow.mjs","utf8");
  const schema=readFileSync("workers/control-plane/migrations/0021_legacy_official_source_directory_shadow.sql","utf8");
  expect(schema).toContain("legacy_official_source_directory_shadow");
  expect(migration).toContain("REPEATABLE READ READ ONLY");
  expect(migration).toContain("d1_exact_hash_and_cardinality_readback:true");
  expect(migration).not.toContain("DELETE FROM");
  expect(migration).not.toContain("settleCoinbase");
  expect(migration).not.toContain("/v1/public/");
  const workflow=readFileSync(".github/workflows/supabase-source-directory-d1-shadow.yml","utf8");
  expect(workflow).toContain("branches: [main]");
  expect(workflow).toContain('".github/workflows/supabase-source-directory-d1-shadow.yml"');
  expect(workflow).toContain("github.event_name == 'workflow_dispatch' || github.event_name == 'push'");
  expect(workflow).toContain("environment: production");
  expect(workflow).not.toMatch(/^  schedule:/m);
  expect(workflow).toContain("secrets.SUPABASE_DB_URL");
  expect(workflow).toContain("secrets.CLOUDFLARE_API_TOKEN");
  expect(workflow).toContain("secrets.SUPABASE_SERVICE_ROLE_KEY");
  expect(migration).toContain("POSTGREST_TWO_PASS_READ_ONLY");
  expect(migration).toContain("SUPABASE_REST_DOUBLE_READ_HASH");
  expect(migration).toContain('const api="https://"+AUTHORITATIVE_PROJECT+".supabase.co/rest/v1/"');
  expect(migration).toContain('if(first.manifest_sha256!==second.manifest_sha256');
  expect(migration).toContain('method:"GET",redirect:"error",cache:"no-store"');
  expect(migration).toContain("source_read_transport:snapshot.read_transport");
  expect(migration).not.toContain("console.error(response)");
  expect(migration).not.toContain("console.error(service)");
  expect(migration).toContain("SUPABASE_URI_VALIDATION");
  expect(migration).toContain("SUPABASE_READ_ONLY_PSQL");
  expect(migration).toContain("SUPABASE_ROW_VALIDATION");
  expect(migration).toContain("CLOUDFLARE_D1_DISCOVERY");
  expect(migration).toContain("CLOUDFLARE_D1_WRITES");
  expect(migration).toContain("CLOUDFLARE_D1_READBACK");
  expect(migration).not.toContain("console.error(error)");
  expect(workflow).not.toMatch(/^  schedule:/m);
 });
});
