import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(process.cwd(), "src/lib/country-risk-publisher.server.ts"),
  "utf8",
);

describe("canonical Risk Object evidence boundary", () => {
  it("filters CANONICAL publication to commercially eligible structured events", () => {
    expect(source).toContain('deliveryProfile === "PUBLIC_DEMO" ||');
    expect(source).toContain('deliveryProfile === "CANONICAL"');
    expect(source).toContain('item.status === "VERIFIED"');
    expect(source).toContain('item.status === "DERIVED_ONLY"');
  });

  it("does not weaken the eligibility rule for paid canonical delivery", () => {
    expect(source).not.toContain(
      'deliveryProfile === "CANONICAL" ? loaded.events :',
    );
  });
});
