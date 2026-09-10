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

  it("recursively strips upstream publisher identity from generic public data proxy JSON", () => {
    const proxy = read("src/routes/api.public-data-proxy.ts");
    for (const key of [
      "source_name",
      "source_domain",
      "source_url",
      "sourceName",
      "sourceDomain",
      "sourceUrl",
      "publisher",
      "publisher_name",
      "publisherName",
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
});
