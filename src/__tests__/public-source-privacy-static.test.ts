import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

function read(path: string) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

describe("public upstream source privacy", () => {
  it("removes source identity columns from canonical public intelligence and event reads", () => {
    const intelligence = read("src/lib/public-intelligence.functions.ts");
    const event = read("src/lib/public-event.functions.ts");

    for (const source of [intelligence, event]) {
      expect(source).not.toMatch(/\.select\([^)]*source_name/s);
      expect(source).not.toMatch(/\.select\([^)]*source_domain/s);
      expect(source).not.toMatch(/\.select\([^)]*source_url/s);
    }
  });

  it("recursively strips upstream identity, rights and internal provenance from generic public data proxy JSON", () => {
    const proxy = read("src/routes/api.public-data-proxy.ts");
    for (const key of [
      "source_id",
      "source_ids",
      "source_record_id",
      "source_record_ids",
      "source_name",
      "source_domain",
      "source_url",
      "source_urls",
      "sourceName",
      "sourceDomain",
      "sourceUrl",
      "publisher",
      "publisher_name",
      "publisherName",
      "provider",
      "provider_name",
      "providerName",
      "licence",
      "license",
      "licence_name",
      "license_name",
      "provenance",
      "retrieval_metadata",
      "raw_payload",
      "raw_content",
      "parser_version",
      "normalized_hash",
    ]) {
      expect(proxy).toContain(`\"${key}\"`);
    }
    expect(proxy).toContain("redactPrivateSourceIdentity");
    expect(proxy).toContain("PRIVATE_SOURCE_KEYS.has(key)");
  });

  it("does not render source names, domains or outbound source links on the public event page", () => {
    const detail = read("src/components/intelligence/event-detail-workspace.tsx");
    expect(detail).not.toContain("event.source_name");
    expect(detail).not.toContain("event.source_domain");
    expect(detail).not.toContain("event.source_url");
    expect(detail).not.toContain("Open original source");
  });

  it("never populates publisher identity in the public intelligence client model", () => {
    const model = read("src/lib/use-intelligence.ts");
    expect(model).toContain("sourceName: null");
    expect(model).not.toContain("r.source_name");
  });

  it("keeps the free structural digest source-free", () => {
    const digest = read("src/lib/public-structural-digest.server.ts");
    expect(digest).toContain('delivery_boundary: "STRUCTURED_DERIVED_INTELLIGENCE_ONLY"');
    expect(digest).toContain("source_identity_included: false");
    expect(digest).not.toContain("source_id: row.source_id");
    expect(digest).not.toContain("source_url: row.source_url");
  });
});
