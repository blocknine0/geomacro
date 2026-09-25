import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { loadCountryCorroborationWindow } from "../../supabase/functions/live-flash-corroborate/country-window";

const asOf = "2026-09-25T12:00:00.000Z";
function client(rows: Record<string, unknown>[], count = rows.length) {
  const urls: URL[] = [];
  const db = createClient("https://example.supabase.co", "test-key", {
    global: { fetch: async (input) => {
      urls.push(new URL(String(input)));
      return new Response(JSON.stringify(rows), {
        headers: { "Content-Type": "application/json", "Content-Range": `0-${rows.length - 1}/${count}` },
      });
    } },
  });
  return { db: db as unknown as Parameters<typeof loadCountryCorroborationWindow>[0], urls };
}

describe("country corroboration replay", () => {
  it("reconsiders an unverified three-hour-old pair and retains both as matching references", async () => {
    const rows = ["bbc_world_rss", "scmp_china_rss"].map((source_id, i) => ({
      flash_id: `flash-${i}`, source_id, verification_status: "UNVERIFIED",
      ingested_at: "2026-09-25T09:00:00.000Z", last_seen_at: "2026-09-25T09:00:00.000Z",
      live_flash_event_countries: [{ country_iso3: "CHN" }],
    }));
    const { db, urls } = client(rows);
    const result = await loadCountryCorroborationWindow(db, "CHN", asOf, 0);
    expect(result.candidates).toHaveLength(2);
    expect(result.flashes).toHaveLength(2);
    expect(result.nextOffset).toBeNull();
    const query = urls[0].searchParams;
    expect(query.get("live_flash_event_countries.country_iso3")).toBe("eq.CHN");
    expect(query.getAll("last_seen_at")).toEqual(["gte.2026-09-25T06:00:00.000Z", `lte.${asOf}`]);
    expect(query.has("ingested_at")).toBe(false);
    expect(query.get("verification_status")).toContain("UNVERIFIED");
    expect(query.get("verification_status")).toContain("CORROBORATING");
    expect(query.get("verification_status")).toContain("VERIFIED");
  });

  it("does not skip older candidates as earlier batches become verified", async () => {
    const rows = Array.from({ length: 250 }, (_, i) => ({
      flash_id: `flash-${String(i).padStart(3, "0")}`, verification_status: "UNVERIFIED",
    }));
    const { db } = client(rows);
    const first = await loadCountryCorroborationWindow(db, "CHN", asOf, 0);
    expect(first.nextOffset).toBe(120);
    for (const row of rows.slice(0, 120)) row.verification_status = "VERIFIED";
    const second = await loadCountryCorroborationWindow(db, "CHN", asOf, first.nextOffset!);
    expect(second.candidates[0].flash_id).toBe("flash-120");
    expect(second.nextOffset).toBe(240);
    const third = await loadCountryCorroborationWindow(db, "CHN", asOf, second.nextOffset!);
    expect(third.candidates).toHaveLength(10);
    expect(third.nextOffset).toBeNull();
  });

  it("advances even when a complete batch is already verified", async () => {
    const rows = Array.from({ length: 121 }, (_, i) => ({
      flash_id: `flash-${i}`, verification_status: i < 120 ? "VERIFIED" : "UNVERIFIED",
    }));
    const { db } = client(rows);
    const result = await loadCountryCorroborationWindow(db, "CHN", asOf, 0);
    expect(result.candidates).toEqual([]);
    expect(result.nextOffset).toBe(120);
  });

  it.each([601, 2])("refuses a truncated corpus with count %i", async (count) => {
    const { db } = client([{ flash_id: "one", verification_status: "UNVERIFIED" }], count);
    await expect(loadCountryCorroborationWindow(db, "CHN", asOf, 0)).rejects.toThrow(/overflow|incomplete/);
  });
});
