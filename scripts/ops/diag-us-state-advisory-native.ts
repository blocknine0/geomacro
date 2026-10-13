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
const report={
  schema:"geomacro.state-original-advisory-once.v1",
  http:response.status,verified_transport:response.ok && /<rss\b/iu.test(body),
  examined:parsed.metrics.seen,
  qualified_source_native_clocks:parsed.metrics.native_clock_valid,
  qualified_first_party_urls:parsed.metrics.original_link_valid,
  current_signals:parsed.dated.length,
  provider_titles_logged:false,provider_article_urls_logged:false,
  signed_gro_generated:false,scoring_performed:false,payment_sent:false,
};
console.log(JSON.stringify(report));
if(!report.verified_transport || parsed.metrics.seen===0) process.exitCode=2;
