import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("RSS worker source selection contract", () => {
  it("supports an explicit bounded source cohort and rejects unknown IDs", () => {
    const worker = read("workers/telegram-flash/worker.py");
    expect(worker).toContain("BREAKING_RSS_SOURCE_IDS");
    expect(worker).toContain("unknown source IDs");
    expect(worker).toContain('"source_filter": requested_source_ids');
    expect(worker).toContain("feeds = [");
    expect(worker).toContain("for feed in feeds:");
  });
});
