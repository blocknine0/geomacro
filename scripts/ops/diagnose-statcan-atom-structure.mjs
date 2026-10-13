#!/usr/bin/env node
/**
 * Optional bounded read-only diagnostic for the four fixed official Atom feeds.
 * NO original headline, URL, publisher identity, body, query or article hash
 * is ever emitted. Counts alone diagnose the candidate-admission gap.
 */
const paths = ["18", "36", "12", "14"];
async function probe(subject, index) {
  let status = 0, reason = "unavailable", metrics = {};
  try {
    const response = await fetch(`https://www150.statcan.gc.ca/n1/rss/dai-quo/${subject}-eng.atom`, {
      method: "GET", redirect: "error", cache: "no-store",
      headers: { Accept: "application/atom+xml, application/xml" },
      signal: AbortSignal.timeout(7_000),
    });
    status = response.status;
    if (!response.ok) throw Error("NON_SUCCESS");
    const raw = await response.text();
    if (new TextEncoder().encode(raw).byteLength > 384*1024) throw Error("OVERSIZED");
    const entries=[...raw.matchAll(/<(?:atom:)?entry(?:\s[^>]*)?>([\s\S]*?)<\/(?:atom:)?entry>/gi)]
      .slice(0,75).map(m=>m[1]);
    const title = (v) => /<(?:atom:)?title(?:\s[^>]*)?>([\s\S]*?)<\/(?:atom:)?title>/i.exec(v)?.[1] ?? "";
    const eligibleTitle = (v) => title(v).replace(/<[^>]*>/g," ").replace(/&[^;]{1,16};/g," ").trim();
    const atomDailyPattern=/www150\.statcan\.gc\.ca\/n1\/daily-quotidien\/\d{6}\/dq\d{6}[a-z]-eng\.htm/i;
    metrics={
      entry_count:entries.length,
      title_tag_count:entries.filter(v=>title(v).length>0).length,
      title_length_at_least_12_count:entries.filter(v=>eligibleTitle(v).length>=12).length,
      title_has_nested_markup_count:entries.filter(v=><|>/.test(title(v))).length,
      daily_article_ref_count:entries.filter(v=>atomDailyPattern.test(v)).length,
      any_first_party_ref_count:entries.filter(v=>/www150\.statcan\.gc\.ca/i.test(v)).length,
      atom_updated_count:entries.filter(v=>/<(?:atom:)?updated\b/i.test(v)).length,
      atom_published_count:entries.filter(v=>/<(?:atom:)?published\b/i.test(v)).length,
      atom_title_namespace_count:entries.filter(v=>/<atom:title\b/i.test(v)).length,
      alternate_title_namespace_count:entries.filter(v=>/<dc:title\b/i.test(v)).length,
    };
    reason="ok";
  } catch(error) { reason=error?.name==="TimeoutError"?"timeout":"unavailable"; }
  return { lane_index:index, http_status:status, reason, ...metrics };
}
const outcomes=await Promise.all(paths.map(probe));
console.log(JSON.stringify({ schema:"geomacro.statcan-atom-structure-diagnostics.v1",
  private_publisher_data_logged:false, no_payment:true, checks:outcomes }));
if (outcomes.every(x=>x.reason!=="ok")) process.exitCode=2;
