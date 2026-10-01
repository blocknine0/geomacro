import fs from "node:fs";
import { describe, expect, it } from "vitest";

const schema = fs.readFileSync(
  "supabase/migrations/20261001173026_canonical_gdelt_doc_acquisition_schema.sql",
  "utf8",
);
const rights = fs.readFileSync(
  "supabase/migrations/20261001173042_canonical_structured_event_effective_rights_view.sql",
  "utf8",
);
const triggers = fs.readFileSync(
  "supabase/migrations/20261001173100_canonical_structured_event_discovery_triggers.sql",
  "utf8",
);
const sync = fs.readFileSync(
  "scripts/ops/sync-gdelt-doc-discovery-fingerprints.mjs",
  "utf8",
);
const workflow = fs.readFileSync(
  ".github/workflows/gdelt-doc-provenance-seed.yml",
  "utf8",
);

describe("GDELT DOC acquisition provenance", () => {
  it("registers GDELT DOC as derived-only and stores only compact fingerprints", () => {
    expect(schema).toContain("'gdelt_doc'");
    expect(schema).toContain("'DERIVED_ONLY'");
    expect(schema).toContain("live_source_discovery_fingerprints");
    expect(schema).toContain("fingerprint ~ '^[a-f0-9]{64}$'");
    expect(schema).toContain("enable row level security");
    expect(schema).toContain("to service_role");
  });

  it("uses acquisition provenance before internal transport rights and still fails closed", () => {
    expect(rights).toContain("coalesce(e.acquisition_source_key, m.source_key)");
    expect(rights).toContain("transport.commercial_usage_status = 'INTERNAL_INHERIT_ONLY'");
    expect(rights).toContain("coalesce(policy.commercial_usage_status, 'REVIEW_REQUIRED')");
    expect(rights).toContain("commercial_source_review_required");
    expect(rights).toContain("security_invoker = true");
  });

  it("attaches only exact active fingerprints and preserves effective source on archive", () => {
    expect(triggers).toContain("f.fingerprint = new.fingerprint");
    expect(triggers).toContain("f.source_key = 'gdelt_doc'");
    expect(triggers).toContain("f.expires_at >= now()");
    expect(triggers).toContain("coalesce(old.acquisition_source_key, v_transport_source_key)");
    expect(triggers).toContain("e.acquisition_source_key = new.source_key");
  });

  it("makes one bounded GDELT DOC query and never stores raw publisher payload", () => {
    expect(sync).toContain('maxrecords: String(MAX_RECORDS)');
    expect(sync).toContain('const MAX_RECORDS = 25');
    expect(sync).toContain('sort: "HybridRel"');
    expect(sync).toContain("canonicalUrl(article?.url)");
    expect(sync).toContain("live_source_discovery_fingerprints");
    expect(sync).toContain("raw_publisher_payload_stored: false");
    expect(sync).not.toContain("article.title,");
    expect(sync).not.toContain("article.description,");
  });

  it("runs before the bounded Auto Ingest News schedule under the same concurrency lock", () => {
    expect(workflow).toContain('cron: "12 */6 * * *"');
    expect(workflow).toContain("group: geomacro-intelligence-orchestrator");
    expect(workflow).toContain("cancel-in-progress: false");
    expect(workflow).toContain("sync-gdelt-doc-discovery-fingerprints.mjs");
    expect(workflow).not.toContain("B2_APPLICATION_KEY");
  });
});
