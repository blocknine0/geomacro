import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  probeQuotaSafeDiscovery as actualProbeQuotaSafeDiscovery, summarizeOriginalFallback,
} from "../../scripts/lib/quota-safe-original-discovery-fallback.mjs";
import {
  discoveryMonitorExitCode,
} from "../../scripts/ops/probe-market-signal-discovery.mjs";

const now = new Date("2026-10-09T15:00:00.000Z");
const privateGkg=()=>({
  schema:"geomacro.private-gdelt-gkg-bulk-discovery.v1",
  state:"CURRENT_GKG_BATCH_SCANNED_PRIVATE_DISCOVERY_ONLY",
  archive_integrity_verified:true,
  archive_sha256:"a".repeat(64),batch_age_minutes:15,
  original_pubdate_verified:false,independent_event_verified:false,
  domains:["geopolitics","macro","rare_earth"].map(category=>({
    category,theme_matched_article_count:3,observed_outlet_host_count:2,
    article_origin_publication_verified:false,
    same_event_independently_corroborated:false,
    current_scored_event_verified:false,
    commercial_rights_verified:false,chargeable:false,
  })),
  chargeable:false,public_published:false,supabase_requests:0,
  b2_requests:0,d1_writes:0,payments_performed:0,
});
const probeQuotaSafeDiscovery=(options:any)=>
  actualProbeQuotaSafeDiscovery({gkgProbe:async()=>({
    ...privateGkg(),state:"GKG_BULK_DEGRADED",archive_integrity_verified:false,
  }),...options});

const primary = (healthy: boolean) => ({
  schema: "geomacro.global-open-signal-discovery.v1",
  source_reachability: healthy ? "ALL_POLL_OK" : "DEGRADED",
  categories: ["geopolitics", "macro", "rare_earth"].map(category => ({
    category, source_transport_ok: healthy, 
    source_failure_reason: healthy ? null : "HTTP_429",
    publicly_scored: false, chargeable: false,
  })),
  source_heartbeat_is_event_freshness: false,
  three_category_current_scored_ready: false,
  chargeable: false, supabase_reads: 0, supabase_writes: 0, b2_requests: 0,
});
const official = () => ({
  schema: "geomacro.official-native-source-audit.v1",
  supabase_reads: 0, supabase_writes: 0, b2_requests: 0,
  public_published: false, proves_public_scored_intelligence: false,
  categories: ["geopolitics", "macro", "rare_earth"].map((category, index) => ({
    category, fetch_ok: true, publisher_transport_ok: true,
    recent_original_count: index + 1,
    public_scored_verified: false, commerce_eligible: false,
    // Sensitive fields must NEVER appear in the public receipt.
    article_url: "https://secret.example/item", title: "private source material",
  })),
});

describe("#1827 low-quota GDELT original publisher backup", () => {
  it("prefers actual GKG three-domain bulk before the DOC API or official fallback",async()=>{
    const doc=vi.fn(async()=>primary(true));
    const originalSpy=vi.fn(async()=>official());
    const bulk=vi.fn(async()=>privateGkg());
    const receipt=await probeQuotaSafeDiscovery({now,primaryProbe:doc,
      officialProbe:originalSpy,gkgProbe:bulk});
    expect(bulk).toHaveBeenCalledTimes(1);
    expect(doc).not.toHaveBeenCalled();
    expect(originalSpy).not.toHaveBeenCalled();
    expect(receipt.source_reachability).toBe("GKG_BULK_ACTIVE_DOC_NOT_POLLED");
    expect(receipt.gdelt_static_bulk_discovery.archive_integrity_verified).toBe(true);
    expect(receipt.categories).toHaveLength(3);
    expect(receipt.categories.every((x:any)=>x.state==="DOC_NOT_POLLED_GKG_PRIMARY" &&
      x.source_transport_ok===false && !x.chargeable)).toBe(true);
    expect(receipt.three_category_current_scored_ready).toBe(false);
    expect(discoveryMonitorExitCode(receipt)).toBe(0);
    expect(receipt.independent_original_publisher_fallback.state).toBe("NOT_NEEDED");
    expect(receipt.chargeable).toBe(false);
  });
  it("rejects forged GKG green receipts and falls back to DOC + official",async()=>{
    const doc=vi.fn(async()=>primary(false));
    const receipt=await probeQuotaSafeDiscovery({now,primaryProbe:doc,
      officialProbe:async()=>official(),
      gkgProbe:async()=>({...privateGkg(),domains:privateGkg().domains.map((x:any)=>
        ({...x,article_origin_publication_verified:true}))})});
    expect(doc).toHaveBeenCalledTimes(1);
    expect(receipt.source_reachability).toBe("DEGRADED");
    expect(receipt.gdelt_static_bulk_discovery.state).toBe("GKG_BULK_AUDIT_INVALID");
    expect(discoveryMonitorExitCode(receipt)).toBe(1);
  });


  it("makes no official fallback requests while GDELT is healthy", async () => {
    const backup = vi.fn(official);
    const receipt = await probeQuotaSafeDiscovery({
      now, primaryProbe: vi.fn(async () => primary(true)),
      officialProbe: backup,
    });
    expect(backup).not.toHaveBeenCalled();
    expect(receipt.independent_original_publisher_fallback.state).toBe("NOT_NEEDED");
    expect(discoveryMonitorExitCode(receipt)).toBe(0);
    expect(receipt.chargeable).toBe(false);
  });

  it("polls original official publishers on 429 without laundering current/paid readiness", async () => {
    const backup = vi.fn(async () => official());
    const receipt = await probeQuotaSafeDiscovery({
      now, primaryProbe: async () => primary(false),
      officialProbe: backup,
    });
    expect(backup).toHaveBeenCalledTimes(1);
    expect(receipt.gdelt_static_bulk_discovery).toMatchObject({
      state:"GKG_BULK_DEGRADED",archive_integrity_verified:false,chargeable:false,
    });
    expect(receipt.source_reachability).toBe("DEGRADED");
    expect(discoveryMonitorExitCode(receipt)).toBe(1);
    expect(receipt.independent_original_publisher_fallback).toMatchObject({
      state: "ORIGINAL_SOURCE_POLL_OK", domains_reached: 3,
      private_candidate_counts: { geopolitics: 1, macro: 2, rare_earth: 3 },
      same_event_independently_corroborated: false,
      commercial_rights_verified: false, public_scored: false, chargeable: false,
    });
    expect(JSON.stringify(receipt)).not.toContain("secret.example");
    expect(JSON.stringify(receipt)).not.toContain("private source material");
    expect(receipt.three_category_current_scored_ready).toBe(false);
    expect(receipt.b2_requests).toBe(0);
    expect(receipt.supabase_writes).toBe(0);
  });

  it("never treats partial original feed success as a green GDELT monitor", async () => {
    const audit = official();
    audit.categories[2].fetch_ok = false;
    const receipt = await probeQuotaSafeDiscovery({
      now, primaryProbe: async () => primary(false), officialProbe: async () => audit,
    });
    expect(receipt.independent_original_publisher_fallback).toMatchObject({
      state: "ORIGINAL_SOURCE_DEGRADED", domains_reached: 2,
      private_candidate_counts: { geopolitics: 1, macro: 2, rare_earth: 0 },
    });
    expect(discoveryMonitorExitCode(receipt)).toBe(1);
  });

  it("does not turn one failed third publisher into full original-source success",async()=>{
    const audit=official();
    audit.categories[2].publisher_transport_ok=false;
    const receipt=await probeQuotaSafeDiscovery({
      now,primaryProbe:async()=>primary(false),officialProbe:async()=>audit,
    });
    expect(receipt.independent_original_publisher_fallback).toMatchObject({
      state:"ORIGINAL_SOURCE_DEGRADED",
      domains_reached:3,
      all_attempted_publisher_transports_ok:false,
      private_candidate_counts:{geopolitics:1,macro:2,rare_earth:3},
      chargeable:false,public_scored:false,
    });
    expect(receipt.source_reachability).toBe("DEGRADED");
    expect(discoveryMonitorExitCode(receipt)).toBe(1);
  });

  it("drops malformed, wrong-rights, or leaking private backup receipts entirely", () => {
    const bad = official();
    bad.categories[1].commerce_eligible = true;
    expect(summarizeOriginalFallback(bad).state).toBe("BACKUP_AUDIT_INVALID");
    bad.categories[1].commerce_eligible = false;
    bad.categories[1].recent_original_count = 1000000;
    expect(summarizeOriginalFallback(bad).state).toBe("BACKUP_AUDIT_INVALID");
    const missingTransport = official();
    delete (missingTransport.categories[0] as any).publisher_transport_ok;
    expect(summarizeOriginalFallback(missingTransport).state)
      .toBe("BACKUP_AUDIT_INVALID");
    const dup = official();
    dup.categories[2].category = "macro";
    expect(summarizeOriginalFallback(dup).state).toBe("BACKUP_AUDIT_INVALID");
    expect(JSON.stringify(summarizeOriginalFallback(dup))).not.toContain("secret.example");
  });

  it("does not falsely mark primary failures green when backup throws", async () => {
    const receipt = await probeQuotaSafeDiscovery({
      now, primaryProbe: async () => { throw Error("sensitive primary failure"); },
      officialProbe: async () => { throw Error("sensitive backup failure"); },
    });
    expect(receipt.source_reachability).toBe("DEGRADED");
    expect(receipt.independent_original_publisher_fallback.state)
      .toBe("ORIGINAL_SOURCE_UNAVAILABLE");
    expect(JSON.stringify(receipt)).not.toContain("sensitive");
    expect(discoveryMonitorExitCode(receipt)).toBe(1);
  });

  it("stays fixed-source, no-payments, no-B2 and does not run remote calls in PR CI", () => {
    const workflow = readFileSync(".github/workflows/global-open-signal-monitor.yml", "utf8");
    const probe = readFileSync("scripts/ops/probe-market-signal-discovery.mjs", "utf8");
    expect(workflow).toContain("quota-safe-original-discovery-fallback.mjs");
    expect(workflow).toContain("quota-safe-original-discovery-fallback.test.ts");
    expect(workflow).toContain("if: github.event_name != 'pull_request'");
    expect(probe).toContain("probeQuotaSafeDiscovery");
    expect(workflow).not.toContain("B2_KEY_ID");
    expect(workflow).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(workflow).not.toContain("GROQ_API_KEY");
  });
});
