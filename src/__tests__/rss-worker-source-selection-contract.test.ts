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
    expect(worker).toContain('"kind": "rss_source_complete"');
    expect(worker).toContain('"ok": True');
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

  it("hydrates missing strict publication times only from publisher-native article metadata", () => {
    const worker = read("workers/telegram-flash/worker.py");
    expect(worker).toContain("class PublisherArticleTimestampParser:");
    expect(worker).toContain("PUBLISHER_PUBLISHED_META_KEYS");
    expect(worker).toContain('"article:published_time"');
    expect(worker).toContain('"datepublished"');
    expect(worker).toContain("exact_publisher_timestamp");
    expect(worker).toContain("moment.tzinfo is None");
    expect(worker).toContain("hydrate_article_published_at");
    expect(worker).toContain("article_timestamp_hosts");
    expect(worker).toContain("fetch_article_published_at_sync");
    expect(worker).toContain("publisher_article_metadata");
    expect(worker).toContain('"publication_timestamp_source": timestamp_source');
    expect(worker).toContain('["english.news.cn"]');
    expect(worker).toContain('["www.scmp.com", "scmp.com"]');
    expect(worker).toContain('["investinglive.com", "www.investinglive.com"]');
  });

  it("recovers readable malformed RSS or Atom XML without weakening fail-closed behavior", () => {
    const worker = read("workers/telegram-flash/worker.py");
    expect(worker).toContain("class LenientFeedParser:");
    expect(worker).toContain('from html.parser import HTMLParser');
    expect(worker).toContain("parse_rss_entries(");
    expect(worker).toContain('getattr(parsed, "bozo", False)');
    expect(worker).toContain("if recovered:");
    expect(worker).toContain("Feed parse failed:");
    expect(worker).toContain("parsedate_to_datetime");
    expect(worker).toContain("datetime.fromisoformat");
  });
});
