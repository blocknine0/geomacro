import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  NOAA_NATIVE_DAY_SAMPLE_OFFSETS,
  noaaLatestNativeDayCandidates,
  fetchNoaaLatestNativeDayRows,
  validateNoaaNativeDailyRows,
} from "../../scripts/lib/governed-source-native-time.mjs";

const now=new Date("2026-10-10T04:50:00.000Z");
const native=(date:string)=>({
  date:date+"T00:00:00",station:"GHCND:USW00001234",
  datatype:"TMAX",value:236,
});

describe("#1827 latest NOAA source-native daily sampling, not false GRI freshness",()=>{
  it("uses exactly four bounded newest-first, UTC and rollover-safe original measurement days",()=>{
    expect(NOAA_NATIVE_DAY_SAMPLE_OFFSETS).toEqual([2,5,9,14]);
    expect(noaaLatestNativeDayCandidates({now})).toEqual([
      "2026-10-08","2026-10-05","2026-10-01","2026-09-26",
    ]);
    expect(noaaLatestNativeDayCandidates({
      now:new Date("2027-01-02T01:00:00Z"),
    })).toEqual([
      "2026-12-31","2026-12-28","2026-12-24","2026-12-19",
    ]);
    expect(noaaLatestNativeDayCandidates({
      now:new Date("2028-03-02T01:00:00Z"),
    })).toEqual([
      "2028-02-29","2028-02-26","2028-02-22","2028-02-17",
    ]);
  });

  it("first qualified recent native day stops after exactly one provider HTTP request",async()=>{
    const fetchImpl=vi.fn(async (u:string,opts:any)=>{
      const url=new URL(u);
      expect(url.hostname).toBe("www.ncei.noaa.gov");
      expect(url.pathname).toBe("/cdo-web/api/v2/data");
      expect(url.searchParams.get("startdate")).toBe("2026-10-08");
      expect(url.searchParams.get("enddate")).toBe("2026-10-08");
      expect(url.searchParams.get("limit")).toBe("25");
      expect(url.searchParams.get("datasetid")).toBe("GHCND");
      expect(url.searchParams.get("locationid")).toBe("FIPS:US");
      expect(opts.headers.token).toBe("fixture-noaa-token");
      return Response.json({results:[native("2026-10-08")]});
    });
    const proof=await fetchNoaaLatestNativeDayRows({
      now,token:"fixture-noaa-token",fetchImpl,
    });
    expect(proof.source_native_day).toBe("2026-10-08");
    expect(proof.provider_http_requests).toBe(1);
    expect(proof.rows).toEqual([native("2026-10-08")]);
    expect(proof).toMatchObject({
      publisher_article_published_at_verified:false,
      current_intelligence_available:false,
      commercial_eligible:false,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(proof)).not.toContain("fixture-noaa-token");
  });

  it("one unavailable native date tries only the next candidate then stops at first real observation",async()=>{
    const requested:string[]=[];
    const fetchImpl=vi.fn(async (u:string)=>{
      const day=new URL(u).searchParams.get("startdate")!;
      requested.push(day);
      return Response.json(day==="2026-10-05"?
        {results:[native(day)]}:{results:[]});
    });
    const r=await fetchNoaaLatestNativeDayRows({now,token:"t",fetchImpl});
    expect(requested).toEqual(["2026-10-08","2026-10-05"]);
    expect(r.source_native_day).toBe("2026-10-05");
    expect(r.rows[0].date).toBe("2026-10-05T00:00:00");
    expect(r.provider_http_requests).toBe(2);
  });

  it("no live NOAA observations fail closed after four bounded calls with no archive approval",async()=>{
    const requested:string[]=[];
    const fetchImpl=vi.fn(async (u:string)=>{
      requested.push(new URL(u).searchParams.get("startdate")!);
      return Response.json({results:[]});
    });
    await expect(fetchNoaaLatestNativeDayRows({now,token:"t",fetchImpl}))
      .rejects.toThrow("NOAA_NCEI_NO_RECENT_NATIVE_DAY_ROWS");
    expect(requested).toEqual([
      "2026-10-08","2026-10-05","2026-10-01","2026-09-26",
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("a provider auth/rate error or wrong-day record never causes unsafe retries or fabricated date",async()=>{
    const unauth=vi.fn(async()=>new Response("rate-limit",{status:429}));
    await expect(fetchNoaaLatestNativeDayRows({
      now,token:"t",fetchImpl:unauth,
    })).rejects.toThrow("NOAA_NCEI_HTTP_429");
    expect(unauth).toHaveBeenCalledTimes(1);

    const shifted=vi.fn(async()=>Response.json({
      results:[native("2026-10-07")],
    }));
    await expect(fetchNoaaLatestNativeDayRows({
      now,token:"t",fetchImpl:shifted,
    })).rejects.toThrow("GOVERNED_NOAA_NATIVE_DAY_PROVENANCE_INVALID");
    expect(shifted).toHaveBeenCalledTimes(1);
    expect(() => validateNoaaNativeDailyRows([
      {...native("2026-10-08"),date:"2026-02-30T00:00:00"},
    ],"2026-10-08")).toThrow();
    expect(() => validateNoaaNativeDailyRows([
      {...native("2026-10-08"),value:null},
    ],"2026-10-08")).toThrow(
      "GOVERNED_NOAA_NATIVE_DAY_PROVENANCE_INVALID");
    expect(() => validateNoaaNativeDailyRows(
      Array.from({length:26},()=>native("2026-10-08")),"2026-10-08",
    )).toThrow("GOVERNED_NOAA_DAY_RESPONSE_INVALID");
  });

  it("entire ingestion still preflights BOTH providers before quota-governed B2 PUT",()=>{
    const ingest=readFileSync("scripts/ingest-certified-sources.mjs","utf8");
    const workflow=readFileSync(".github/workflows/governed-source-ingestion.yml","utf8");
    const path=readFileSync("scripts/lib/governed-source-native-time.mjs","utf8");
    expect(ingest).toContain("await fetchNoaaLatestNativeDayRows({");
    expect(ingest).toContain("const sourceBatches = [];");
    expect(ingest.indexOf("const sourceBatches = [];"))
      .toBeLessThan(ingest.indexOf("archiveSourceBatch(sourceId, rows);"));
    expect(ingest).toContain("GOVERNED_SOURCE_MINIMUM_B2_BUDGET_INSUFFICIENT");
    expect(ingest).toContain("sourceNativeMeasurementTime(observed, sourceId");
    expect(ingest).not.toContain("startdate=2026-09-01");
    expect(path).toContain("NOAA_NATIVE_DAY_SAMPLE_OFFSETS");
    expect(path).toContain("NOAA_NCEI_NO_RECENT_NATIVE_DAY_ROWS");
    expect(workflow).toContain('B2_ACCOUNT_QUOTA_REQUIRED: "1"');
    // A single daily post-UTC-reset observation import is quota-safe; unlike
    // push-on-control-plane merges, it does not imply fresh world news.
    expect(workflow).toContain('cron: "17 2 * * *"');
    expect(workflow).not.toContain('      - "workers/control-plane/**"');
    expect(workflow).toContain("Read shared B2 account headroom before downloading source data");
    expect(workflow).toContain("steps.headroom.outputs.admitted == 'true'");
    expect(workflow).toContain("Verify D1 checkpoint readback");
  });
});
