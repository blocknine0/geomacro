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
    expect(worker).toContain("process_one_feed(feed) for feed in feeds");
  });

  it("keeps the default runtime source set registry-driven", () => {
    const worker = read("workers/telegram-flash/worker.py");
    expect(worker).toContain("feeds = RSS_FEEDS");
    expect(worker).toContain('"feeds": [feed["source_id"] for feed in feeds]');
    expect(worker).toContain('"kind": "rss_poll"');
  });

  it("applies a non-zero minimum retry budget uniformly to configured feeds", () => {
    const worker = read("workers/telegram-flash/worker.py");
    expect(worker).toContain('feed["retry_attempts"] = max(');
    expect(worker).toContain('2,');
    expect(worker).toContain('int(feed.get("retry_attempts", 2))');
    expect(worker).toContain("http.client.IncompleteRead");
    expect(worker).toContain("ConnectionResetError");
  });

  it("processes independent feeds concurrently", () => {
    const worker = read("workers/telegram-flash/worker.py");
    expect(worker).toContain("asyncio.gather(");
    expect(worker).toContain("*(process_one_feed(feed) for feed in feeds)");
  });
});
