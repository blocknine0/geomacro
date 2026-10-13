import { parseFirstPartyFeed } from "../../src/lib/stateless-intelligence-model";

const url="https://travel.state.gov/_res/rss/TAsTWs.xml";
const source={
  id:"us_state_advisories",
  category:"geopolitics" as const,
  media:"rss" as const,
  url,allowedHosts:["travel.state.gov"],credit:null,
};
const response=await fetch(url,{
  redirect:"error",
  headers: { Accept:"application/rss+xml, application/xml, text/xml" },
  signal:AbortSignal.timeout(10_000),
});
const body=await response.text();
const parsed=parseFirstPartyFeed(body.slice(0,384*1024),source,Date.now());
const items=[...body.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/giu)].slice(0,75);
const datedItems=items.filter(x=>/<pubDate(?:\s[^>]*)?>/iu.test(x[1]));
const parsedItems=items.filter(x=>{
  const match=/<pubDate(?:\s[^>]*)?>([^<>]{8,90})<\/pubDate>/iu.exec(x[1]);
  return match && Number.isFinite(Date.parse(match[1]));
});
const distinctDateSamples=parsedItems.slice(0,8).map(x=>{
  const m=/<pubDate(?:\s[^>]*)?>([^<>]{8,90})<\/pubDate>/iu.exec(x[1]);
  const t=Date.parse(m?.[1]??"");
  return Number.isFinite(t)?Math.floor((Date.now()-t)/86_400_000):null;
});
const report={
  schema:"geomacro.state-original-advisory-once.v1",
  http:response.status,verified_transport:response.ok && /<rss\b/iu.test(body),
  examined:parsed.metrics.seen,
  pubdate_tagged:datedItems.length,parseable_pubdate:parsedItems.length,
  sample_age_days:distinctDateSamples,
  qualified_source_native_clocks:parsed.metrics.native_clock_valid,
  qualified_first_party_urls:parsed.metrics.original_link_valid,
  current_signals:parsed.dated.length,
  provider_titles_logged:false,provider_article_urls_logged:false,
  signed_gro_generated:false,scoring_performed:false,payment_sent:false,
};
console.log(JSON.stringify(report));
if(!report.verified_transport || parsed.metrics.seen===0) process.exitCode=2;
