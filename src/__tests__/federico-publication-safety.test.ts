import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { dryRunCountryRiskObject, publishCountryRiskObject } from "../lib/country-risk-publisher.server";
import { assertFedericoPublicationReady } from "../lib/federico-publication-policy";
import type { GeomacroRiskObject } from "../lib/risk-object-contract";

const mocks = vi.hoisted(() => ({ db: vi.fn(), sign: vi.fn(), persist: vi.fn(), read: vi.fn() }));
vi.mock("../lib/risk-supabase.server", () => ({ requireRiskSupabase: mocks.db }));
vi.mock("../lib/risk-object-store.server", () => ({
  getLatestCompatibleCountryRiskObject: vi.fn(async () => null),
  persistRiskObject: mocks.persist, getRiskObjectByObjectId: mocks.read,
}));
vi.mock("../lib/risk-object-signing.server", () => ({
  signRiskObject: mocks.sign, verifyRiskObjectSignature: () => ({ valid: true }),
}));

const asOf = "2026-09-25T12:00:00.000Z";
const input = { country_iso3: "CHN", as_of: asOf, delivery_profile: "FEDERICO_STRICT" as const };
function database(sources: string[], count?: number) {
  const urls: URL[] = [];
  const flashes = sources.map((source_id, i) => ({
    flash_id: `flash-${i}`, source_id, source_record_id: `source-record-${i}`,
    verification_status: "VERIFIED", event_family_id: "family-1",
    headline: "China announces trade policy", source_url: `https://example.com/${i}`,
    content_hash: String(i).repeat(64), severity: 40, source_reliability: 95,
    event_type: "trade_policy", first_seen_at: "2026-09-25T10:00:00.000Z",
    last_seen_at: "2026-09-25T11:00:00.000Z", published_at: "2026-09-25T10:00:00.000Z",
  }));
  const db = createClient("https://example.supabase.co", "test-key", {
    global: { fetch: async (request) => {
      const url = new URL(String(request)); urls.push(url);
      const table = url.pathname.split("/").pop();
      const rows = table === "live_flash_event_families" ? [{
        family_id: "family-1", signal_category: "GEOPOLITICS", country_isos: ["CHN"],
        first_seen_at: "2026-09-25T10:00:00.000Z", last_seen_at: "2026-09-25T11:00:00.000Z",
        last_material_update_at: "2026-09-25T10:00:00.000Z", current_status: "ACTIVE",
      }] : table === "live_flash_events" ? flashes : flashes.map(row => ({
        flash_id: row.flash_id, country_iso3: "CHN", confidence: 95,
        is_primary: true, attribution_method: "SUPPLIED_ISO3_VALIDATED",
      }));
      return new Response(JSON.stringify(rows), { headers: {
        "Content-Type": "application/json",
        "Content-Range": `0-${rows.length - 1}/${table === "live_flash_events" ? count ?? rows.length : rows.length}`,
      } });
    } },
  });
  mocks.db.mockReturnValue(db);
  return urls;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sign.mockImplementation((object: GeomacroRiskObject) => object);
  mocks.persist.mockImplementation(async (object: GeomacroRiskObject) => { mocks.read.mockResolvedValue(object); });
});

describe("Federico publication safety", () => {
  it("reproduces the failed run without signing or persisting the empty UNREADY object", async () => {
    database([]);
    const preview = await dryRunCountryRiskObject(input);
    expect(preview.object.decision_readiness?.status).toBe("UNREADY");
    expect(preview.context.published).toBe(false);
    await expect(publishCountryRiskObject(input)).rejects.toThrow(/publication blocked.*no_fresh_evidence/);
    expect(mocks.sign).not.toHaveBeenCalled();
    expect(mocks.persist).not.toHaveBeenCalled();
  });

  it("does not admit a DEGRADED object with only one independent source", async () => {
    database(["scmp_china_rss"]);
    await expect(publishCountryRiskObject(input)).rejects.toThrow("insufficient_independent_source_families");
    expect(mocks.sign).not.toHaveBeenCalled();
    expect(mocks.persist).not.toHaveBeenCalled();
  });

  it("publishes eligible evidence and scopes the country before the result cap", async () => {
    const urls = database(["scmp_china_rss", "bbc_world_rss"]);
    const result = await publishCountryRiskObject(input);
    expect(result.context.published).toBe(true);
    expect(result.object.decision_readiness?.reason_codes).toEqual(["uncalibrated_uncertainty_interval"]);
    expect(mocks.sign).toHaveBeenCalledOnce();
    expect(mocks.persist).toHaveBeenCalledOnce();
    const query = urls.find(url => url.pathname.endsWith("/live_flash_events"))!.searchParams;
    expect(query.get("live_flash_event_countries.country_iso3")).toBe("eq.CHN");
    expect(query.get("verification_status")).toBe("eq.VERIFIED");
    expect(query.getAll("last_seen_at")).toContain(`lte.${asOf}`);
  });

  it("rejects result truncation instead of signing incomplete country evidence", async () => {
    database(["scmp_china_rss", "bbc_world_rss"], 1001);
    await expect(publishCountryRiskObject(input)).rejects.toThrow("country evidence query was truncated");
    expect(mocks.sign).not.toHaveBeenCalled();
  });

  it("rejects commercial, technical and high-impact failures even on a DEGRADED object", async () => {
    database(["scmp_china_rss", "bbc_world_rss"]);
    const { object } = await dryRunCountryRiskObject(input);
    expect(() => assertFedericoPublicationReady(object)).not.toThrow();
    expect(() => assertFedericoPublicationReady({ ...object, commercial_eligibility: { status: "UNVERIFIED", reason_codes: [] } })).toThrow("commercial_eligibility_unverified");
    expect(() => assertFedericoPublicationReady({ ...object, verification: { ...object.verification, status: "INCOMPLETE" } })).toThrow("verification_incomplete");
    expect(() => assertFedericoPublicationReady({ ...object, decision_readiness: { ...object.decision_readiness!, reason_codes: ["high_impact_evidence_gate_failed"] } })).toThrow("high_impact_evidence_gate_failed");
  });

  it("keeps the unsigned diagnostic preview available for evidence gaps", async () => {
    database([]);
    const { context } = await dryRunCountryRiskObject(input);
    expect(context.country_events_used).toBe(0);
    expect(mocks.persist).not.toHaveBeenCalled();
  });
});
