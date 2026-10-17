import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
import {sourceNativeObservationTime} from "../lib/source-native-observation-time";

const delivered=readFileSync("src/lib/agent-query-response.server.ts","utf8");
const qualified=readFileSync("src/lib/agent-query-deliverability.server.ts","utf8");

describe("prepared x402 structural response matches original-source eligibility",()=>{
  it("uses the exact shared source-native time gate in preflight and prepared output",()=>{
    expect(qualified).toContain("sourceNativeObservationTime(row, asOfMs)");
    expect(delivered).toContain('import { sourceNativeObservationTime } from "./source-native-observation-time"');
    expect(delivered).toContain("sourceNativeObservationTime(row, asOfMs)");
    const helper=delivered.slice(delivered.indexOf("export function latestModuleTimestamp("),
      delivered.indexOf("async function structuralSubject("));
    expect(helper).not.toContain("coverage.map");
    expect(helper).not.toContain("retrieved_at ??");
    expect(helper).toContain("return values.length ? Math.max(...values) : null");
  });
  it("never assembles country A from country B evidence or coverage",()=>{
    expect(delivered).toContain("row.country_iso3 === subject.country_iso3");
    expect(delivered).toContain("latestModuleTimestamp(nativeRows, asOfMs)");
    expect(delivered).toContain('throw new Error("STRUCTURAL_LOCAL_NATIVE_EVIDENCE_NOT_DELIVERABLE")');
  });
  it("cannot relabel a stale or undated original as fresh using today's retrieval or coverage date",()=>{
    const now=Date.parse("2026-10-15T12:00:00.000Z");
    expect(sourceNativeObservationTime({
      observed_at:"2023-08-01T12:00:00Z",
      published_at:"2023-08-02T12:00:00Z",
      retrieved_at:"2026-10-15T11:59:59Z",
    },now)).toBe(Date.parse("2023-08-01T12:00:00Z"));
    expect(sourceNativeObservationTime({
      observed_at:null,published_at:null,
      retrieved_at:"2026-10-15T11:59:59Z",
    },now)).toBeNull();
    expect(sourceNativeObservationTime({
      observed_at:"2026-10-16T12:00:00Z",published_at:"2025-01-01T12:00:00Z",
    },now)).toBeNull();
  });
});
