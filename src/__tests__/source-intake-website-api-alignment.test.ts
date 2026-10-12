import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  PUBLIC_SOURCE_COVERAGE_DOMAINS,
  publicIntelligenceSourceCoverage,
} from "../lib/public-intelligence-source-coverage";

const privateReceipt=JSON.parse(readFileSync(
  "config/public-intelligence-source-intake-coverage.v1.json","utf8",
)) as any;
const domains=["geopolitics","macro-fx","critical-minerals"] as const;

describe("#1827 private source inventory versus customer-only derived structured output",()=>{
  it("retains the real 1059-reference independent production intake receipt privately",()=>{
    expect(privateReceipt.schema).toBe("geomacro.public-source-intake-coverage.v1");
    expect(privateReceipt.totals.catalog_entries).toBe(1059);
    expect(domains.map(x=>privateReceipt.domains[x].total))
      .toEqual([467,459,133]);
    expect(privateReceipt.source_receipt.observed_at)
      .toBe("2026-10-12T08:23:20.646Z");
    expect(privateReceipt.source_receipt.workflow_run_url)
      .toBe("https://github.com/blocknine0/geomacro/actions/runs/38223231621");
    expect(privateReceipt.source_receipt.latest_private_repo_sync_verified).toBe(true);
    expect(privateReceipt.source_receipt.realtime_event_publication_verified).toBe(false);
    expect(privateReceipt.totals.operator_named_corridors_catalogued_not_publishers).toBe(58);
    for(const domain of domains){
      const x=privateReceipt.domains[domain];
      const {total,label,...lanes}=x;
      expect(Object.values(lanes).reduce((n:number,v:any)=>n+Number(v),0)).toBe(total);
    }
  });

  it("never packages private registry/source inventory or receipt URLs into customer GET or browser bundle",()=>{
    const publicCode=readFileSync("src/lib/public-intelligence-source-coverage.ts","utf8");
    const monitor=readFileSync("src/components/intelligence/source-network-monitor.tsx","utf8");
    expect(publicCode).not.toContain('import intakeReceipt from');
    expect(publicCode).not.toContain("config/public-intelligence-source-intake-coverage");
    for(const prohibited of [
      "catalogued_entries","catalogued_by_lane","evidence_receipt_url",
      "catalogued_as_of","latest_private_repo_sync_verified",
      "telegram_candidates_unapproved","operator_corridor","operator_country",
    ]){
      expect(publicCode).not.toContain(prohibited);
      expect(monitor).not.toContain(prohibited);
    }
    expect(monitor).toContain("Intelligence verification status");
    expect(monitor).toContain("Source identities and internal receipts remain private.");
    expect(monitor).not.toContain("Inspect intake evidence");
    expect(monitor).not.toContain("Registered source-lane entries");
    expect(monitor).not.toContain("catalogued_entries");
    expect(monitor).toContain("classifySourcePulse(data, row.category)");
    expect(monitor).toContain('method: "GET"');
    expect(monitor).not.toContain('method: "POST"');
  });

  it("returns three category-scoped discovery abilities with no source identity, URL, count or raw content",()=>{
    expect(PUBLIC_SOURCE_COVERAGE_DOMAINS.map(x=>x.category)).toEqual([...domains]);
    for(const entry of PUBLIC_SOURCE_COVERAGE_DOMAINS){
      expect(entry.schema).toBe("geomacro.public-intelligence-monitoring-capability.v1");
      expect(entry.source_identity_disclosed).toBe(false);
      expect(entry.raw_third_party_content_delivered).toBe(false);
      expect(entry.monitoring_is_not_scored_intelligence).toBe(true);
      expect(entry.current_event_observed_by_this_catalog).toBe(false);
      expect(entry.current_scored_intelligence_from_this_catalog).toBe(false);
      expect(entry.paid_intelligence_authorized_by_catalog).toBe(false);
      expect(entry.requires_independent_paid_availability).toBe(true);
      expect(entry.intelligence_query_method).toBe("POST");
      expect(entry.intelligence_delivery_mode).toBe("EXISTING_VERIFIED_RISK_OBJECT_GATE_ONLY");
      const json=JSON.stringify(entry);
      expect(json).not.toMatch(/https?:\/\//i);
      expect(json).not.toContain("1827");
      expect(json).not.toContain("source_name");
      expect(json).not.toContain("publisher_name");
      expect(json).not.toContain("source_ref");
      expect(json).not.toContain("github.com");
      expect(json).not.toContain("telegram");
      expect(json).not.toContain("1059");
    }
  });

  it("rejects inherited-property and unexpected product names without leaking source details",()=>{
    for(const key of ["__proto__","constructor","source_map",""]){
      expect(()=>publicIntelligenceSourceCoverage(key as any))
        .toThrow("INTELLIGENCE_CATEGORY_INVALID");
    }
  });

  it.each(domains)("binds %s customer API to its fixed product scope without source credits",domain=>{
    const coverage=publicIntelligenceSourceCoverage(domain);
    const api=readFileSync(`src/routes/api.v1.intelligence.${domain}.ts`,"utf8");
    expect(api).toContain(`path: "${coverage.intelligence_query_path}"`);
    expect(api).toContain(`category: "${domain}"`);
    expect(coverage.intelligence_query_path).toBe(`/api/v1/intelligence/${domain}`);
  });

  it("retains canonical POST paid/no-charge verification while public GET is source-private",()=>{
    const handler=readFileSync("src/lib/category-intelligence-alias.server.ts","utf8");
    expect(handler).toContain("source_intake: publicIntelligenceSourceCoverage(");
    expect(handler).toContain("return mainnetIntelligenceHandlers.POST({ request: canonicalRequest })");
    expect(handler).toContain("if (!response.ok) return response");
    expect(handler).toContain('availability_check: "POST_WITHOUT_PAYMENT_SIGNATURE"');
    const pulse=readFileSync("src/lib/current-30min-original-source-pulse.server.ts","utf8");
    expect(pulse).not.toContain("source_status_endpoint:PULSE_URL");
    const page=readFileSync("src/routes/intelligence.tsx","utf8");
    expect(page).toContain("<SourceNetworkMonitor category={category} />");
    expect(page).toContain("currentVerifiedDeskEvents(selectedPool)");
  });
});
