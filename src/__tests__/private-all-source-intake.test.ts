import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  assemblePrivateIntakeSnapshot,
  gatherPrivateIntakeSnapshot,
} from "../../scripts/ops/assemble-private-all-source-intake.mjs";

const now = new Date("2026-10-10T15:00:00.000Z");
const fixture = () => ({
  core: {
    categories: {
      GEOPOLITICS: [{ id: "gdelt" }],
      MACRO: [{ id: "ecb" }],
      CRITICAL_MINERALS: [{ id: "usgs" }],
    },
  },
  free: { sources: [
    { category: "GEOPOLITICS", id: "un_news" },
    { category: "ALL", id: "all_shared" },
  ]},
  roots: { roots: [
    { category: "MACRO", source_id: "gov_root" },
  ]},
  telegram: {
    schema: "geomacro.telegram-source-registry.v1",
    sources: [
      {
        category: "CRITICAL_MINERALS",
        candidate_key: "mineral-signal",
        publisher_authorized: false,
        activation_status: "DISABLED",
      },
      {
        category: "GEOPOLITICS",
        candidate_key: "explicitly-authorized",
        publisher_authorized: true,
        activation_status: "ACTIVE",
        authorization_reference: "approved-evidence",
      },
    ],
  },
  historical: { sources: [
    { category: "geopolitics", source_id: "ucdp", status: "PRODUCTION_APPROVED" },
    { category: "crypto", source_id: "legacy_crypto", status: "RESEARCH_ONLY" },
  ]},
});

describe("#1827 collect all sources BEFORE qualification, privately and honestly", () => {
  it("catalogues every registered three-domain lane, including non-approved candidates", () => {
    const result = assemblePrivateIntakeSnapshot(fixture(), now);
    expect(result.schema).toBe("geomacro.private-all-source-intake-inventory.v1");
    expect(result.sources_catalogued).toBe(11);
    expect(result.lane_counts).toEqual({
      core: 3, free: 4, roots: 1, telegram: 2, historical: 1,
    });
    expect(result.domain_lane_counts.CRITICAL_MINERALS.telegram).toBe(1);
    expect(result.domain_lane_counts.GEOPOLITICS.historical).toBe(1);
    expect(result.historical_crypto_legacy_excluded).toBe(1);
    expect(result.status_counts.TELEGRAM_CANDIDATE_NOT_AUTHORIZED).toBe(1);
    expect(result.status_counts.AUTHORIZED_TELEGRAM_CANDIDATE_NOT_POLLED).toBe(1);
    expect(result.status_counts.HISTORICAL_EVIDENCE_NOT_CURRENT_EVENT).toBe(1);
  });

  it("does NOT put raw Telegram IDs, URLs, secret data or original stories in the candidate queue", () => {
    const result = assemblePrivateIntakeSnapshot(fixture(), now);
    const str = JSON.stringify(result);
    for (const raw of ["mineral-signal","explicitly-authorized","gov_root","ucdp","all_shared"]) {
      expect(str).not.toContain(raw);
    }
    expect(result.source_refs.every((x) => /^[a-f0-9]{32}$/u.test(x.source_ref))).toBe(true);
    expect(result.boundaries).toMatchObject({
      telegram_messages_ingested:false,
      historical_rows_downloaded:false,
      source_ownership_or_permissions_granted:false,
      rights_approval_bypassed:false,
      public_published:false,
      chargeable:false,
      direct_b2_requests:0,
      d1_writes:0,
      supabase_requests:0,
      payment_performed:false,
    });
  });

  it("refuses unknown domains, invalid identities and duplicate candidates", () => {
    const badDomain=fixture();
    badDomain.historical.sources[0].category="other";
    expect(() => assemblePrivateIntakeSnapshot(badDomain,now)).toThrow();
    const duplicate=fixture();
    duplicate.telegram.sources.push({...duplicate.telegram.sources[0]});
    expect(() => assemblePrivateIntakeSnapshot(duplicate,now)).toThrow();
    const wrongPublisher=fixture();
    wrongPublisher.telegram.schema="unexpected";
    expect(() => assemblePrivateIntakeSnapshot(wrongPublisher,now)).toThrow();
  });

  it("never interprets identity verified alone as authorization", () => {
    const candidate=fixture();
    candidate.telegram.sources[0].candidate_status="IDENTITY_VERIFIED";
    candidate.telegram.sources[0].activation_status="ACTIVE";
    expect(assemblePrivateIntakeSnapshot(candidate,now)
      .status_counts.TELEGRAM_CANDIDATE_NOT_AUTHORIZED).toBe(1);
  });

  it("uses only the two fixed remote public SOURCE REGISTRY documents, not raw channel fetches", async () => {
    const remote = fixture();
    const seen:string[]=[];
    const fetcher=vi.fn(async (url:string) => {
      seen.push(url);
      if(url.includes("geomacro-telegram-signals")) return remote.telegram;
      if(url.includes("geomacro-historical-data")) return remote.historical;
      throw Error("UNEXPECTED_REMOTE");
    });
    const report=await gatherPrivateIntakeSnapshot(now,fetcher);
    expect(report.lane_counts.telegram).toBe(2);
    expect(report.lane_counts.historical).toBe(1);
    expect(seen).toHaveLength(2);
    expect(seen.every(url => url.startsWith("https://raw.githubusercontent.com/blocknine0/"))).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("keeps source observation separate from Telegram authorization and external payments", () => {
    const source=readFileSync("scripts/ops/assemble-private-all-source-intake.mjs","utf8");
    const flow=readFileSync(".github/workflows/three-domain-private-source-intake.yml","utf8");
    expect(source).toContain("TELEGRAM_CANDIDATE_NOT_AUTHORIZED");
    expect(source).toContain("HISTORICAL_EVIDENCE_NOT_CURRENT_EVENT");
    expect(source).toContain("rights_approval_bypassed: false");
    expect(flow).toContain('cron: "27 0,3,6,9,12,15,18,21 * * *"');
    expect(flow).toContain('cron: "57 1,4,7,10,13,16,19,22 * * *"');
    expect(flow).toContain("persist-credentials: false");
    expect(flow).not.toContain("secrets.SUPABASE");
    expect(flow).not.toContain("secrets.TELEGRAM");
    expect(flow).not.toContain("secrets.B2");
    expect(flow).not.toContain("wrangler d1 execute");
    expect(flow).not.toContain("write_secret");
    expect(flow).toContain("retention-days: 2");
  });
});
