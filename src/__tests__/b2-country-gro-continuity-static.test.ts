import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("country GRO zero-cost continuity", () => {
  it("serves canonical signed GROs from authenticated D1 hot state without synchronous B2 reads", () => {
    const resolver = read("src/lib/country-gro-resolver.server.ts");
    const client = read("src/lib/d1-country-gro-hot.server.ts");
    expect(resolver).toContain('from "./d1-country-gro-hot.server"');
    expect(resolver).toContain("readD1VerifiedHotCountryGro(countryIso3, atOrBefore)");
    expect(resolver).not.toContain("readB2LatestCanonicalCountryGro");
    expect(client).toContain("geomacro-control-plane-v1");
    expect(client).toContain('authorization: `Bearer ${token}`');
    expect(client).toContain("canonicalRiskObjectJson(object)");
    expect(client).toContain("verifyRiskObjectSignature(object).valid");
    expect(client).toContain("verifyCommercialRiskObjectArtifact(object");
    expect(client).toContain('payload?.archive_readback_required_for_serving !== false');
  });

  it("stores only derived signed GRO hot artifacts, never raw evidence", () => {
    const migration = read("workers/control-plane/migrations/0012_country_gro_verified_hot.sql");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS country_gro_verified_hot");
    expect(migration).toContain("object_json TEXT NOT NULL");
    expect(migration).toContain("archive_write_acknowledged INTEGER NOT NULL");
    expect(migration).toContain("archive_readback_verified INTEGER NOT NULL DEFAULT 0");
    expect(migration).not.toMatch(/raw_payload\s+TEXT/i);
    expect(migration).not.toMatch(/evidence_payload\s+TEXT/i);
    expect(migration).not.toMatch(/source_body\s+TEXT/i);
  });

  it("uses one compressed B2 bundle plus one proof manifest for the hot publication cycle", () => {
    const publisher = read("scripts/ops/publish-country-gro-hot-bundle.ts");
    expect(publisher).toContain("geomacro.country-gro-verified-hot-bundle.v1");
    expect(publisher).toContain("geomacro.country-gro-verified-hot-proof.v1");
    expect(publisher).toContain("await b2.put(bundleKey, bundlePacked)");
    expect(publisher).toContain("await b2.put(PROOF_KEY, proof)");
    expect(publisher).toContain("b2_put_count: 2");
    expect(publisher).toContain("b2_get_count_for_hot_serving: 0");
    expect(publisher).toContain("archive_readback_required_for_hot_serving: false");
    expect(publisher).toContain("d1_signed_gro_hot_verified: true");
    expect(publisher).toContain("const childEnv = { ...process.env }");
    expect(publisher).toContain("delete childEnv.NODE_OPTIONS");
    expect(publisher).toContain("env: childEnv");
    expect(publisher).toContain("async function d1BatchQuery");
    expect(publisher).toContain('JSON.stringify({ batch })');
    expect(publisher).toContain("boundedD1Batches(writeQueries)");
    expect(publisher).toContain("params: [");
    expect(publisher).toContain("row.object_json");
    expect(publisher).toContain("d1_parameterized_writes: true");
    expect(publisher).not.toContain("country-gro-hot.sql");
    expect(publisher).not.toContain("sqlText(row.object_json)");
    expect(publisher).not.toContain("await b2.get(");
  });

  it("independently verifies D1 readback before declaring the hot set ready", () => {
    const publisher = read("scripts/ops/publish-country-gro-hot-bundle.ts");
    expect(publisher).toContain("COUNTRY_GRO_HOT_D1_READBACK_CARDINALITY_INVALID");
    expect(publisher).toContain("COUNTRY_GRO_HOT_D1_READBACK_MISMATCH");
    expect(publisher).toContain("COUNTRY_GRO_HOT_D1_READBACK_VERIFY_FAILED");
    expect(publisher).toContain("verifyRiskObjectSignature(object, keys).valid");
    expect(publisher).toContain("verifyCommercialRiskObjectArtifact(object");
    expect(publisher).toContain("canonicalRiskObjectJson(object)");
    expect(publisher).toContain("archive_write_acknowledged=1");
  });

  it("keeps B2 readback as a deferred cold-archive audit and never weakens failures other than the known download cap", () => {
    const workflow = read(".github/workflows/b2-country-gro-continuity.yml");
    const audit = read("scripts/ops/verify-country-gro-cold-bundle.ts");
    expect(workflow).not.toContain("Preflight private B2 read capacity");
    expect(workflow).toContain("Publish all currently VERIFIED GROs after refresh");
    expect(workflow).toContain("Audit bundled B2 cold archive when read capacity is available");
    expect(workflow).toContain("B2_DOWNLOAD_CAP_EXCEEDED");
    expect(workflow).toContain("hot_serving_blocked\":false");
    expect(workflow).toContain('exit "$rc"');
    expect(audit).toContain("await b2.get(PROOF_KEY)");
    expect(audit).toContain("await b2.get(String(proof.bundle_key))");
    expect(audit).toContain("archive_readback_verified=1");
    expect(audit).toContain("hot_serving_was_not_blocked_on_this_audit:true");
  });

  it("proves the serving canary with both B2 and Supabase credentials removed", () => {
    const canary = read("scripts/ops/verify-country-gro-hot-serving.ts");
    expect(canary).toContain("delete process.env.B2_KEY_ID");
    expect(canary).toContain("delete process.env.B2_ARCHIVE_READ_KEY_ID");
    expect(canary).toContain("delete process.env.APP_SUPABASE_URL");
    expect(canary).toContain("delete process.env.SUPABASE_DB_URL");
    expect(canary).toContain("readD1VerifiedHotCountryGro(iso3, at)");
    expect(canary).toContain('serving_store: "cloudflare-d1"');
    expect(canary).toContain("b2_network_read_required: false");
  });

  it("keeps the 195+ paid-ready floor and refuses synthetic gap fill", () => {
    const workflow = read(".github/workflows/b2-country-gro-continuity.yml");
    const runner = read("scripts/refresh-global-canonical-risk-objects.ts");
    expect(workflow).toContain('GLOBAL_CANONICAL_MIN_READY: "195"');
    expect(workflow).toContain('GLOBAL_CANONICAL_MIN_COUNTRY_LIKE_DENOMINATOR: "195"');
    expect(workflow).toContain('.country_count >= 1');
    expect(workflow).toContain('GLOBAL_GRO_D1_MIN_INDEXED: "1"');
    expect(workflow).toContain("global_195_coverage_claimed == false");
    expect(workflow).toContain("Only ${ready:-0} country-like subjects are commercially deliverable; 195 are required.");
    expect(workflow).toContain(".country_count >= 195");
    expect(workflow).toContain(".d1_signed_gro_hot_verified == true");
    expect(runner).toContain('const COUNTRY_LIKE_SPECIALS = new Set(["PSE", "TWN"])');
    expect(runner).toContain("unverified_objects_signed_for_gap_fill: false");
    expect(runner).toContain("raw_source_material_emitted: false");
  });

  it("seeds only already-current VERIFIED GROs before the long refresh and skips the seed when hot serving exists", () => {
    const workflow = read(".github/workflows/b2-country-gro-continuity.yml");
    const publisher = read("scripts/ops/publish-country-gro-hot-bundle.ts");
    const hotCheck = workflow.indexOf("Check whether verified D1 country GRO hot serving already exists");
    const seed = workflow.indexOf("Seed existing VERIFIED current GROs before the long global refresh");
    const refresh = workflow.indexOf("Refresh global commercially governed canonical GROs");
    expect(hotCheck).toBeGreaterThan(-1);
    expect(seed).toBeGreaterThan(hotCheck);
    expect(refresh).toBeGreaterThan(seed);
    expect(workflow).toContain("if: steps.hot.outputs.ready != 'true'");
    expect(workflow).toContain('GLOBAL_GRO_D1_MIN_INDEXED: "1"');
    expect(workflow).toContain("COUNTRY_GRO_HOT_READY_FLOOR_BREACH:0<1");
    expect(workflow).toContain("No pre-existing current VERIFIED GRO is available");
    expect(workflow).toContain("publishable=true");
    expect(workflow).toContain("coverage_floor_met=false");
    expect(publisher).toContain('process.env.COUNTRY_GRO_HOT_PUBLISH_OUTPUT');
    expect(publisher).toContain("only_verified_current_objects_admitted: true");
    expect(publisher).toContain("global_195_coverage_claimed: false");
  });

  it("protects the D1 country GRO read behind the server-only control-plane token", () => {
    const worker = read("workers/control-plane/src/index.mjs");
    expect(worker).toContain("async function getCountryGroVerifiedHot");
    expect(worker).toContain('parts[1] === "country-gro-hot"');
    expect(worker.indexOf("const auth = authorized(request, env)")).toBeLessThan(
      worker.indexOf('parts[1] === "country-gro-hot"'),
    );
    expect(worker).toContain("archive_readback_required_for_serving: false");
    expect(worker).toContain("archive_write_acknowledged !== 1");
    expect(worker).toContain('serving_store: "cloudflare-d1"');
    expect(worker).toContain('archive_store: "backblaze-b2"');
  });
});
