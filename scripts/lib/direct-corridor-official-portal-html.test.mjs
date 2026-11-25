import test from "node:test";
import assert from "node:assert/strict";
import { DIRECT_CORRIDOR_OFFICIAL_HTML_PORTALS, extractOfficialPortalMetadata, fetchOfficialPortalMetadata } from "./direct-corridor-official-portal-html.mjs";

test("official HTML portals are query-free HTTPS and corridor-only", () => {
  assert.ok(DIRECT_CORRIDOR_OFFICIAL_HTML_PORTALS.length >= 5);
  for (const s of DIRECT_CORRIDOR_OFFICIAL_HTML_PORTALS) {
    const u = new URL(s.url);
    assert.equal(u.protocol, "https:");
    assert.equal(u.search, "");
    assert.equal(s.channel, "CORRIDOR_ONLY");
    assert.equal(s.event_verified, false);
    assert.equal(s.commercial_eligible, false);
  }
});

test("extractOfficialPortalMetadata extracts same-host dated items and blocks external links", () => {
  const source = DIRECT_CORRIDOR_OFFICIAL_HTML_PORTALS[0];
  const origin = new URL(source.url).origin;
  const html = `<div><span>2026-11-24</span><a href="/news/policy-update-2026">Central bank issues November liquidity update</a><a href="https://evil.example/phish">External phishing article title here</a></div>`;
  const items = extractOfficialPortalMetadata({ html, source });
  assert.equal(items.length, 1);
  assert.equal(items[0].url, origin + "/news/policy-update-2026");
  assert.equal(items[0].published_at_raw, "2026-11-24");
});

test("fetchOfficialPortalMetadata fails closed on Cloudflare challenge", async () => {
  const source = DIRECT_CORRIDOR_OFFICIAL_HTML_PORTALS[0];
  const out = await fetchOfficialPortalMetadata(source, {
    fetchImpl: async () => new Response("Just a moment... Cloudflare", { status: 200 }),
  });
  assert.equal(out.status, "TRANSPORT_BLOCKED");
  assert.deepEqual(out.items, []);
});
