import {test} from "node:test";
import assert from "node:assert/strict";
import {normalizeNativeFeedXml,verifiedRdfItemClock}
 from "./native-feed-xml-normalizer.mjs";

test("repairs only in-memory bare XML ampersands and unsafe control characters",()=>{
 const raw='<?xml version="1.0"?><rss><channel><item><title>Rates & currency</title>'+
  '<link>https://example.org/news?a=1&b=2</link>'+
  '<pubDate>Sat, 24 Oct 2026 23:50:00 GMT</pubDate></item></channel></rss>';
 const clean=normalizeNativeFeedXml(raw);
 assert.ok(clean.includes("Rates &amp; currency"));
 assert.ok(clean.includes("news?a=1&amp;b=2"));
 assert.equal(normalizeNativeFeedXml(raw+"X".repeat(250000)),null);
 assert.equal(normalizeNativeFeedXml('<!DOCTYPE x [<!ENTITY a SYSTEM "file:///etc/passwd">]><rss/>'),null);
 assert.equal(normalizeNativeFeedXml("<html><body>not a feed</body></html>"),null);
});
test("RDF date MUST be per-item and require explicit Dublin Core namespace",()=>{
 const rdf='<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" '+
  'xmlns:dc="http://purl.org/dc/elements/1.1/">'+
  '<item><title>Material supply policy</title><dc:date>2026-10-24T23:51:00Z</dc:date></item></rdf:RDF>';
 const normalized=normalizeNativeFeedXml(rdf);
 assert.equal(verifiedRdfItemClock(normalized,
  '<item><dc:date>2026-10-24T23:51:00Z</dc:date></item>'),
  "2026-10-24T23:51:00Z");
 assert.equal(verifiedRdfItemClock(normalized,
  '<item><title>Different event</title></item>'),null);
 assert.equal(verifiedRdfItemClock(rdf.replace('xmlns:dc','xmlns:other'),
  '<item><dc:date>2026-10-24T23:51:00Z</dc:date></item>'),null);
 assert.equal(verifiedRdfItemClock('<feed><updated>2026-10-24T23:51:00Z</updated></feed>',
  '<entry><updated>2026-10-24T23:51:00Z</updated></entry>'),null);
});
