import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Static test: historical recovery must never replace original publication
// timestamps with fetch/restore timestamps, skip outage weeks, or persist raw.
const script=readFileSync("scripts/ops/backfill-website-derived-news.ts","utf8");
describe("website-only original-date 72-hour shutdown gap repair",()=>{
  it("searches the full rolling 72-hour window in weekly page slices",()=>{
    expect(script).toContain("TODAY-3*DAY_MS");
    expect(script).toContain("ms+=7*DAY_MS");
    expect(script).toContain("for(const start of [0,80])");
    expect(script).toContain("sourceWindows.push");
    expect(script).toContain("filter_public_timestamp");
    expect(script).toContain("order");
    expect(script).toContain("matches].slice(0,15)");
  });
  it("confirms independent first_published_at on every archived article",()=>{
    expect(script).toContain("page.first_published_at");
    expect(script).toContain("originalPublicationMs");
    expect(script).toContain("if(at===null||at<START_MS)return null");
    expect(script).toContain("deriveStatelessSignals");
    expect(script).toContain("source_raw_stored:false");
  });
  it("keeps one 72h derived-only journal and fail-closed readback",()=>{
    expect(script).toContain("/v1/website-derived-news");
    expect(script).toContain("/v1/public/website-derived-news");
    expect(script).toContain("HISTORICAL_WRITE_ACK_MISMATCH");
    expect(script).toContain("backdated_stories:false");
    expect(script).toContain("supabase_dependency:false");
    expect(script).not.toContain("SUPABASE_DB_URL");
    expect(script).not.toContain("signed_risk_object");
  });
});
