import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const INTERNAL_ID_RE = /evt_[a-z0-9_]+/i;

describe("public live feed id isolation", () => {
  it("the public FeedEvent contract contains no internal id field", () => {
    const src = readFileSync(resolve(__dirname, "../lib/live-feed.types.ts"), "utf8");

    expect(src).not.toMatch(/\bid\s*:/);
    expect(src).not.toMatch(INTERNAL_ID_RE);
  });

  it("LiveNewsFeed maps database rows before storing public feed events", () => {
    const src = readFileSync(resolve(__dirname, "../components/live-news-feed.tsx"), "utf8");

    expect(src).toMatch(/\.map\(rowToEvent\)/);
    expect(src).toMatch(/setEvents\(mapped\)/);
    expect(src).not.toMatch(/\{e\.id\}/);
    expect(src).not.toMatch(/\{event\.id\}/);
    expect(src).not.toMatch(/e\.id\b/);
    expect(src).not.toMatch(INTERNAL_ID_RE);
  });
});
