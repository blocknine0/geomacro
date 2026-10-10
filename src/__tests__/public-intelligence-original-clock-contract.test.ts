import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read=(p:string)=>readFileSync(p,"utf8");

describe("#1827 current intelligence must be source-native, not ingestion-clock fresh",()=>{
  it("does not let the restored B2 row created_at become original event publication",()=>{
    const server=read("src/lib/public-intelligence-production.server.ts");
    const edge=read("src/lib/public-intelligence-edge.ts");
    const workflow=read(".github/workflows/production-website-health.yml");
    expect(server).toContain("function originalPublishedTime(");
    expect(server).toContain("Math.max(best, originalPublishedTime(row))");
    expect(server).toContain("const timestamp = originalPublishedTime(row);");
    expect(server).toContain("const currentWithin24h = scoredCurrentAcrossAllDomains &&");
    expect(edge).toContain("current_within_24h: currentAcrossDomains &&");
    expect(server).not.toContain("Math.max(best, rowTime(row))");
    expect(edge).not.toContain("row.published_at ?? row.created_at");
    expect(edge).toContain('Date.parse(String(row.published_at ?? ""))');
    expect(workflow).not.toContain("row?.published_at ?? row?.created_at");
    expect(workflow).toContain("Date.parse(String(row?.published_at ?? ''))");
    const publicReader=read("src/lib/public-intelligence.functions.ts");
    expect(publicReader).toContain('!Number.isFinite(Date.parse(String(row.published_at ?? "")))');
  });
  it("maintains source-private customer output and negative qualification gates",()=>{
    const gist=read("src/lib/public-intelligence-gist.ts");
    const qualification=read("scripts/lib/independent-same-event-qualification.mjs");
    const review=read("scripts/lib/private-independent-event-review-queue.mjs");
    expect(gist).toContain("Only explicitly approved fields");
    expect(gist).toContain("id: input.id");
    expect(gist).not.toContain("raw_payload: input.raw_payload");
    expect(qualification).toContain("trusted_ed25519_review_signature_verified:true");
    expect(qualification).toContain("commercial_derived_use_rights_verified!==true");
    expect(review).toContain("paid_data_eligible:false");
    expect(review).toContain("independent_human_or_trusted_review_completed:false");
  });
});
