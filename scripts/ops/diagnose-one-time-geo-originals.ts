import { readStatelessWebsiteIntelligence } from "../../src/lib/stateless-public-intelligence.server";

// One-time zero-funds probe; no article titles, source IDs, URLs, event
// payloads, credentials or raw publisher text in logs.
const lanes: Array<{i:number;healthy:boolean;seen:number;relevant:number;nativeClock:number;recovered:number}> = [];
try {
  const result = await readStatelessWebsiteIntelligence("geopolitics",Date.now(),
    (i,metrics) => lanes.push({
      i,healthy:metrics.transport_ok === true,
      seen:metrics.seen,relevant:metrics.relevant,
      nativeClock:metrics.native_clock_valid,
      recovered:metrics.recovered_original_page ?? 0,
    }));
  const now=Date.now();
  console.log(JSON.stringify({
    schema:"geomacro.geo-original-coverage-one-time-probe.v1",
    resultStatus:result.status, configuredFeeds:result.feed_count,
    healthyFeeds:result.healthy_feed_count,
    originalCandidates:result.releases_examined,
    last24h:result.current_24h_count,
    last7d:result.last_7d_count,
    all30d:result.signals.length,
    firstPartyDated24h:result.signals.filter(s=> {
      const ms=Date.parse(s.published_at);
      return Number.isFinite(ms) && now-ms<=86_400_000 && now-ms>=900_000;
    }).length,
    sourceIdentifiersLogged:false,upstreamTitlesLogged:false,
    unscored:true,signed:false,chargeable:false,
    lanes,
  }));
  if (!result.healthy_feed_count) process.exitCode=2;
} catch {
  console.error("GEOPOLITICS_FIRST_PARTY_SOURCE_READBACK_UNAVAILABLE");
  process.exitCode=2;
}
