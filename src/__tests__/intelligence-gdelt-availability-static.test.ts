import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const wrapper = readFileSync("scripts/ops/run-b2-public-intelligence-publisher.mjs", "utf8");
const publisher = readFileSync("scripts/ops/publish-b2-public-intelligence-direct-postgres.mjs", "utf8");
const workflow = readFileSync(".github/workflows/intelligence-scored-refresh.yml", "utf8");
const docFallback = readFileSync("scripts/ops/gdelt-doc-current-evidence.mjs", "utf8");
const masterfileFallback = readFileSync("scripts/ops/gdelt-masterfile-current-evidence.mjs", "utf8");
const preserve = readFileSync("scripts/ops/republish-b2-public-intelligence-preserve-live.mjs", "utf8");

describe("Intelligence GDELT availability contract", () => {
  it("retries only the documented rolling-manifest availability race within a hard bound", () => {
    expect(wrapper).toContain('RETRYABLE_AVAILABILITY_ERROR = "CURRENT_GDELT_EXPORT_UNAVAILABLE"');
    expect(wrapper).toContain("DEFAULT_MAX_WAIT_MS = 8 * 60 * 1000");
    expect(wrapper).toContain("DEFAULT_POLL_MS = 10_000");
    expect(wrapper).toContain("if (!combined.includes(RETRYABLE_AVAILABILITY_ERROR))");
    expect(wrapper).toContain("CURRENT_GDELT_AVAILABILITY_WAIT_EXHAUSTED");
    expect(wrapper).toContain('"event_export_masterfile_tail"');
    expect(wrapper).toContain("eventExportTransports.has(sourceTransport)");
    expect(wrapper).toContain('sourceTransport !== "doc_v2_articlelist"');
    expect(wrapper).not.toContain('"geo_v2_jsonfeed"');
    expect(wrapper).toContain("coverage_runtime_refreshed: coverageRuntimeRefreshed");
    expect(wrapper).not.toContain("--retry-all-errors");
  });

  it("uses bounded verified masterfile Event fallback before DOC without weakening integrity guards", () => {
    expect(publisher).toContain("readCurrentGdeltEvidence");
    expect(publisher).toContain("eventExportTransportUnavailable");
    expect(publisher).toContain("CURRENT_EVIDENCE_HTTP_(404|429|5\\\\d\\\\d)");
    expect(publisher).not.toContain("CURRENT_EVIDENCE_HTTP_(4\\\\d\\\\d|5\\\\d\\\\d)");
    expect(publisher).toContain("GDELT_DOC_SOURCE_TRANSPORT");
    expect(publisher).toContain("DOC_FALLBACK_FAILED");
    expect(docFallback).toContain('GDELT_DOC_API_URL = "https://api.gdeltproject.org/api/v2/doc/doc"');
    expect(docFallback).toContain('url.searchParams.set("timespan", "2h")');
    expect(docFallback).toContain("MIN_INDEPENDENT_DOMAINS = 2");
    expect(docFallback).toContain("group.domains.size >= MIN_INDEPENDENT_DOMAINS");
    expect(docFallback).toContain("not a verified event claim");
    expect(docFallback).toContain('public_status: "live_observed"');
    expect(docFallback).toContain("severity: null");
    expect(docFallback).toContain("delta: null");

    expect(publisher).toContain("readGdeltMasterfileCurrentCandidates");
    expect(publisher).toContain("readCurrentGdeltMasterfileRows");
    expect(publisher).toContain("masterfileFallbackTransportUnavailable");
    expect(publisher).toContain("GDELT_MASTERFILE_SOURCE_TRANSPORT");
    expect(publisher).toContain("CURRENT_GDELT_MASTERFILE_FALLBACK_INVALID");
    expect(publisher).not.toContain("readGdeltGeoCurrentRows");
    expect(publisher).not.toContain("GDELT_GEO_SOURCE_TRANSPORT");

    expect(masterfileFallback).toContain(
      'GDELT_MASTERFILE_URL = "https://data.gdeltproject.org/gdeltv2/masterfilelist.txt"',
    );
    expect(masterfileFallback).toContain('range: `bytes=-${MAX_TAIL_BYTES}`');
    expect(masterfileFallback).toContain("response?.status !== 206");
    expect(masterfileFallback).toContain("CURRENT_GDELT_MASTERFILE_CONTENT_RANGE_INVALID");
    expect(masterfileFallback).toContain('listed.hostname !== "data.gdeltproject.org"');
    expect(masterfileFallback).toContain("/^\\/gdeltv2\\/\\d{14}\\.export\\.CSV\\.zip$/u");
    expect(masterfileFallback).toContain("MAX_CANDIDATES = 8");
    expect(masterfileFallback).toContain("LIVE_MAX_AGE_MS = 2 * 60 * 60 * 1000");

    expect(preserve).toContain("ALLOWED_CURRENT_EVIDENCE_CONTRACTS");
    expect(preserve).toContain("gdelt-geo-v2-global-conflict-coverage-v1");
    expect(preserve).toContain("preserved.evidenceContract");

    // Event-export integrity errors remain hard failures and are never silently
    // converted into DOC fallback evidence.

    expect(publisher).toContain('listed.hostname !== "data.gdeltproject.org"');
    expect(publisher).toContain("CURRENT_GDELT_EXPORT_MD5_MISMATCH");
    expect(publisher).toContain("GDELT_EXPECTED_COLUMNS = 61");
    expect(publisher).toContain("CURRENT_GDELT_BATCH_STALE");
    expect(publisher).toContain("GDELT_FUTURE_TOLERANCE_MS = 5 * 60 * 1000");
    expect(publisher).toContain(
      "Date.parse(row.batchIso) <= asOf.getTime() + GDELT_FUTURE_TOLERANCE_MS",
    );
    expect(publisher).toContain("batchAgeMs < -GDELT_FUTURE_TOLERANCE_MS");
    expect(publisher).toContain('public_status: "live_observed"');
    expect(publisher).toContain("row?.severity !== null");
    expect(publisher).toContain("B2_PUBLIC_INTELLIGENCE_HASH_INVALID");
    expect(publisher).toContain("B2_PUBLIC_INTELLIGENCE_PROOF_READBACK_INVALID");
  });

  it("makes the bounded runner the canonical production publish entrypoint", () => {
    expect(workflow).toContain('scripts/ops/run-b2-public-intelligence-publisher.mjs');
    expect(workflow).toContain('node scripts/ops/run-b2-public-intelligence-publisher.mjs | tee /tmp/intelligence-publish.log');
    expect(workflow).not.toContain('run: bun scripts/ops/publish-b2-public-intelligence-direct-postgres.mjs');
  });

  it("fails closed until production serves current scored data, using live-observed only while scored coverage is incomplete", () => {
    expect(workflow).toContain("PUBLIC_INTELLIGENCE_PUBLISH_PROOF_INVALID");
    expect(workflow).toContain("proof.b2_readback_verified !== true");
    expect(workflow).toContain("for attempt in $(seq 1 40)");
    expect(workflow).toContain("strictly longer than that TTL");
    expect(workflow).toContain("freshness_proof=${nonce}");
    expect(workflow).toContain("-H 'Cache-Control: no-cache'");
    expect(workflow).toContain("scoredCurrentAcrossAllDomains");
    expect(workflow).toContain("body?.mode !== 'verified_b2' || live !== 0");
    expect(workflow).toContain("body?.mode !== 'verified_b2_plus_live_observed' || live < 1");
    expect(workflow).toContain("responseNewest < expectedBatch");
    expect(workflow).toContain("newestLive < expectedBatch");
    expect(workflow).toContain("Production Intelligence API did not converge");
    expect(workflow).not.toContain("the B2 publisher remains authoritative and independently readback-verified");
    expect(workflow).not.toContain("has not caught up to the latest scored-plus-current contract yet");
  });
});
