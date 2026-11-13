import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Radio, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RiskBadge, RiskTrend } from "@/components/foundation/risk";
import {
  applyIntelFilters,
  availableSorts,
  buildPublicIntelligence,
  latestOriginalEvidenceAt,
  prettyCategory,
  useIntelligence,
  type IntelEvent,
  type IntelSort,
} from "@/lib/use-intelligence";
import { getPublicIntelligenceSeo } from "@/lib/public-intelligence-seo.functions";
import { getStatelessIntelligence } from "@/lib/stateless-intelligence.functions";
import { fetchDirectDerivedNews } from "@/lib/public-derived-news-client";
import { StatelessLiveDesk } from "@/components/intelligence/stateless-live-desk";
import { useRiskIndices } from "@/lib/use-risk-indices";
import { withPublicRuntimeTimeout } from "@/lib/public-runtime-timeout";
import { categoryLeads, publicHeadline, scoredNews, COMMERCIAL_DOMAINS } from "@/lib/intelligence-editorial";
import { intelligenceDomainPulse } from "@/lib/intelligence-domain-pulse";
import { currentVerifiedDeskEvents } from "@/lib/intelligence-current-desk";
import { SourceNetworkMonitor } from "@/components/intelligence/source-network-monitor";
import { intelligenceCategorySearch } from "@/lib/intelligence-desk-view";

const TITLE = "Geomacro Finds | Latest Intelligence";
const DESCRIPTION = "Geomacro Finds: on-demand geopolitical, Macro/FX and critical-minerals developments, updated as eligible official releases arrive without an added publication delay. No scores or persistent source storage.";
const URL = "https://geomacro.live/intelligence";
const IMAGE = "https://geomacro.live/og-signal-card-v2.png";

export const Route = createFileRoute("/intelligence")({
  validateSearch: intelligenceCategorySearch,
  loader: async () => {
    const now = Date.now();
    // All THREE actual publisher categories must be present in the first
    // server-rendered HTML when their independent source readers succeed.
    // Previously only geopolitics was SSR-loaded, so no-JS clients and search
    // indexing always saw misleading "Macro 0 / Critical Minerals 0".
    // Keep the bounded direct D1 30-day journal in parallel for continuity.
    // The three category checks are independent: one timeout must never hide
    // another category's valid original-dated releases.
    const domains = ["geopolitics", "macro", "rare_earth"] as const;
    const [geopolitics, macro, minerals, history] = await Promise.allSettled([
      ...domains.map(category => withPublicRuntimeTimeout(
        getStatelessIntelligence({ data: { category } }),
        8_000,
        "Original publisher Intelligence source check timed out.",
      )),
      withPublicRuntimeTimeout(
        fetchDirectDerivedNews(),
        9_000,
        "Derived Intelligence journal read timed out.",
      ),
    ]);
    const accepted = [geopolitics, macro, minerals].map((entry, i) =>
      entry.status === "fulfilled" && !Array.isArray(entry.value) &&
       entry.value.category === domains[i] &&
      entry.value.healthy_feed_count > 0 ? entry.value : null);
    return {
      rows: [],
      now,
      stateless: accepted[0],
      statelessFeeds: {
        ...(accepted[0] ? { geopolitics: accepted[0] } : {}),
        ...(accepted[1] ? { macro: accepted[1] } : {}),
        ...(accepted[2] ? { rare_earth: accepted[2] } : {}),
      },
      // fetchDirectDerivedNews() already returns checked Signal[] directly,
      // NOT {signals}. A successful journal is combined with actual live
      // issuer answers; neither supplies a canonical signed risk score.
      journal: history.status === "fulfilled" && Array.isArray(history.value)
        ? history.value : [],
    };
  },
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { name: "robots", content: "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: URL },
      { property: "og:image", content: IMAGE },
      { property: "og:image:secure_url", content: IMAGE },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: "Geomacro live geopolitical, macroeconomic and critical-minerals risk intelligence" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
      { name: "twitter:image", content: IMAGE },
      { name: "twitter:image:alt", content: "Geomacro live geopolitical, macroeconomic and critical-minerals risk intelligence" },
    ],
    links: [{ rel: "canonical", href: URL }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "Geomacro Risk Intelligence",
          url: URL,
          description: DESCRIPTION,
          inLanguage: "en",
          isPartOf: { "@id": "https://geomacro.live/#website" },
          publisher: { "@id": "https://geomacro.live/#organization" },
        }),
      },
    ],
  }),
  component: StatelessWebsiteIntelligencePage,
});

function StatelessWebsiteIntelligencePage() {
  const loader = Route.useLoaderData();
  const {category}=Route.useSearch();
  return <StatelessLiveDesk initial={loader.stateless} initialFeeds={loader.statelessFeeds} initialJournal={loader.journal} initialView={category??"all"} />;
}

function IntelligencePage() {
  const loaderData = Route.useLoaderData();
  const initialData = useMemo(
    () => loaderData.rows.length ? buildPublicIntelligence(loaderData.rows, loaderData.now) : null,
    [loaderData.now, loaderData.rows],
  );
  const intel = useIntelligence(initialData);
  const riskIndices = useRiskIndices();
  const [category, setCategory] = useState<(typeof COMMERCIAL_DOMAINS)[number]["key"]>("geopolitics");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<IntelSort>("newest");
  const [showHistoricalArchive, setShowHistoricalArchive] = useState(false);

  const pool = useMemo(() => scoredNews(intel.data?.all ?? []), [intel.data]);
  // The category choice scopes every news surface, not just the final cards.
  const selectedDomain = COMMERCIAL_DOMAINS.find((domain) => domain.key === category)!;
  const selectedPool = useMemo(() => pool.filter((event) => event.category === category), [pool, category]);
  const selectedLatestEvidenceAt = latestOriginalEvidenceAt(selectedPool);
  const currentDesk = currentVerifiedDeskEvents(selectedPool);
  const leads = categoryLeads(currentDesk).filter((lead) => lead.key === category);
  const currentScored = currentDesk.length > 0;
  const domainPulse = useMemo(
    () => intelligenceDomainPulse(intel.data?.all ?? []).filter((pulse) => pulse.key === category),
    [intel.data, category],
  );
  const currentObserved = useMemo(() => (intel.data?.all ?? []).filter((event) =>
    event.publicStatus === "live_observed" && event.isCurrent && event.severity === null && event.delta === null,
  ).filter((event) => event.category === category).slice(0, 6), [intel.data, category]);
  const available = useMemo(() => availableSorts(selectedPool), [selectedPool]);
  const activeSort = available.includes(sort) ? sort : "newest";
  const filtered = useMemo(
    () => applyIntelFilters(selectedPool, { category, query, sort: activeSort }),
    [selectedPool, category, query, activeSort],
  );
  const latestVerifiedFallback = selectedPool.length > 0 && !currentScored;
  const historicalCount = selectedPool.length - currentDesk.length;
  const visibleFiltered = showHistoricalArchive ? filtered : currentVerifiedDeskEvents(filtered);
  const latestScoredByCategory = useMemo(() => {
    const latest = new Map<string, IntelEvent>();
    for (const event of selectedPool) {
      if (event.publicStatus !== "verified_b2" || event.severity === null || !event.category) continue;
      // A B2 restore/new database createdAt is not original risk evidence.
      if (!event.publishedAt) continue;
      const eventTime = Date.parse(event.publishedAt);
      if (!Number.isFinite(eventTime)) continue;
      const existing = latest.get(event.category);
      const existingTime = existing?.publishedAt ? Date.parse(existing.publishedAt) : -Infinity;
      if (!existing || !Number.isFinite(existingTime) || eventTime > existingTime) {
        latest.set(event.category, event);
      }
    }
    return latest;
  }, [selectedPool]);

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 md:py-12">
      <header className="max-w-4xl">
        <div className="flex flex-wrap items-center gap-3 font-mono text-[10px] uppercase tracking-[0.16em]">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-primary">
            <Radio className="h-3 w-3" aria-hidden /> {latestVerifiedFallback ? "PREVIOUSLY VERIFIED" :
               currentScored ? "CURRENT VERIFIED INTELLIGENCE" : "AWAITING VERIFIED STORIES"}
          </span>
          <span className="rounded-full border border-border/70 px-2.5 py-1 text-muted-foreground">
            Website view · delayed ≥60 minutes
          </span>
          <span className="text-muted-foreground">
            {intel.status === "updating" ? "Updating" : latestVerifiedFallback
              ? "No current scored intelligence · historical archive available"
              : currentScored ? `${selectedDomain.label} · current original-dated evidence` :
                `No eligible scored headlines for ${selectedDomain.label}`}
          </span>
        </div>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">Risk Intelligence</h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg">
          What changed, why it matters, and how significant is the risk? Explore verified Geomacro assessments across geopolitics, Macro/FX and critical minerals. Website publication is delayed by at least 60 minutes; each assessment retains its original evidence date.
        </p>
        <p className="mt-3 text-sm text-muted-foreground">Free to browse. For structured API delivery or monthly intelligence access, <Link to="/pricing" className="font-medium text-primary hover:underline">compare access options</Link>.</p>
        <p className="mt-2 text-xs text-muted-foreground">
          Publisher inventories and raw evidence stay private. A dataset requiring named credit
          is not eligible for source-private publication until the exact contributing dataset,
          its reuse permission and its required attribution can be verified for that assessment.
        </p>
      </header>

      {intel.data && intel.error ? (
        <section className="mt-6 rounded-xl border border-border/70 bg-card/30 p-4" role="status"
          aria-label="Intelligence live refresh status">
          <h2 className="text-sm font-semibold">Live Intelligence refresh unavailable</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            A fresh verified feed could not be confirmed. Earlier assessments remain dated historical context, not new risk alerts. The original evidence clock is never reset by a browser refresh.
          </p>
          <Button type="button" variant="outline" size="sm" onClick={intel.retry} className="mt-3">
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden /> Retry live verification
          </Button>
        </section>
      ) : null}

      <section className="mt-8" aria-label="Intelligence category">
        <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Choose an intelligence domain</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" role="group" aria-label="Intelligence category">
          {COMMERCIAL_DOMAINS.map((domain) => (
            <button key={domain.key} type="button"
              aria-pressed={category === domain.key}
              onClick={() => { setCategory(domain.key); setShowHistoricalArchive(false); }}
              className={`min-h-11 rounded-xl border px-4 py-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${category === domain.key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-foreground hover:border-primary/60 hover:bg-muted"}`}>
              {domain.key === "geopolitics" ? "Geopolitics" : domain.key === "macro" ? "Macro/FX" : "Critical Minerals"}
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground" role="status">
          Showing {selectedDomain.label} only · Verified intelligence released on this website at least 60 minutes after publication.
        </p>
      </section>

      <section className="mt-8" aria-labelledby="intelligence-freshness-heading">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Three-domain monitoring</p>
        <h2 id="intelligence-freshness-heading" className="mt-1 text-xl font-semibold">Evidence freshness by risk domain</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Updated monitoring is not the same as a new risk assessment. Every domain keeps its last verified severity and original evidence date; newly observed but unscored signals are shown separately.
        </p>
        <div className="mt-4 grid gap-3">
          {domainPulse.map((pulse) => (
            <article key={pulse.key} className="rounded-xl border border-border/70 bg-card/40 p-4">
              <p className="font-mono text-[10px] uppercase tracking-wider text-primary">{pulse.label}</p>
              <p className="mt-2 text-sm font-semibold">
                {pulse.state === "current_scored" ? "Current verified score" :
                  pulse.state === "current_observed" ? "Current monitoring signal · unscored" :
                  pulse.state === "historical_verified" ? "Historical verified assessment" :
                  "Current verified evidence unavailable"}
              </p>
              {pulse.currentScoredCount > 0 && pulse.lastScored?.severity !== null && pulse.lastScored?.severity !== undefined ? (
                <div className="mt-3 flex items-center gap-2">
                  <RiskBadge score={pulse.lastScored.severity} showScore />
                  <span className="text-xs text-muted-foreground">
                    {pulse.currentScoredCount > 0 ? "Current assessment" : "Last verified historical score"}
                  </span>
                </div>
              ) : null}
              {pulse.lastScored ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Score evidence: {pulse.lastScored.publishedAt ? formatDate(pulse.lastScored.publishedAt) : "Original publication time unavailable"}
                </p>
              ) : null}
              {pulse.newestObserved ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  New observation: {pulse.newestObserved.publishedAt ? formatDate(pulse.newestObserved.publishedAt) : "Original publication time unavailable"} · No severity assigned
                </p>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">
                  No current independently eligible monitoring signal in this domain.
                </p>
              )}
            </article>
          ))}
        </div>
      </section>

      <SourceNetworkMonitor category={category === "macro" ? "macro-fx" : category === "rare_earth" ? "critical-minerals" : "geopolitics"} />

      <section className="mt-8 grid gap-3 rounded-2xl border border-border/70 bg-card/40 p-4 sm:grid-cols-[minmax(0,1fr)_170px_auto]">
        <label className="relative min-w-0">
          <span className="sr-only">Search intelligence</span>
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search countries, events or policy changes"
            className="pl-9"
          />
        </label>
        <label>
          <span className="sr-only">Sort</span>
          <select
            value={activeSort}
            onChange={(event) => setSort(event.target.value as IntelSort)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
          >
            <option value="newest">Newest</option>
            <option value="risk">Highest risk</option>
            {available.includes("moving") ? <option value="moving">Fastest moving</option> : null}
          </select>
        </label>
        <Button type="button" variant="outline" onClick={intel.retry} className="gap-2">
          <RefreshCw className="h-4 w-4" aria-hidden /> Refresh
        </Button>
      </section>

      {intel.status === "loading" && !intel.data ? (
        <LoadingGrid />
      ) : !intel.data ? (
        <section className="mt-8 rounded-2xl border border-border/70 bg-card/40 p-6">
          <h2 className="font-medium">Intelligence temporarily unavailable</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {intel.error?.message ?? "The current intelligence feed could not be loaded."}
          </p>
          <Button type="button" variant="outline" onClick={intel.retry} className="mt-4">Retry</Button>
        </section>
      ) : (
        <>
        <section className="mt-8" aria-labelledby="domain-leads-heading">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Global intelligence desk</p>
          <h2 id="domain-leads-heading" className="mt-1 text-2xl font-semibold">Verified news developments</h2>
          <p className="mt-1 text-sm text-muted-foreground">Only scored developments with genuine original evidence dated within 24 hours and past the website 60-minute release cutoff are eligible here. Older intelligence stays in the dated archive.</p>
          {!currentScored ? (
            <p className="mt-4 rounded-xl border border-border/70 px-4 py-3 text-sm text-muted-foreground" role="status">
              No current verified risk assessment is available for {selectedDomain.label}. Monitoring continues, but an unconfirmed source update is not scored intelligence. This does not mean global risk is unchanged.
            </p>
          ) : null}
          <div className="mt-4 grid gap-3">
            {leads.map(({ key, label, event, isCurrent }) => (
              <article key={key} className="flex flex-col rounded-xl border border-border/70 bg-card/50 p-4">
                <p className="font-mono text-[10px] uppercase tracking-widest text-primary">{label}</p>
                {isCurrent && event && event.severity !== null ? (
                  <>
                    <Link to="/event/$eventId" params={{ eventId: event.id }} className="mt-3 flex-1 text-sm font-semibold leading-6 hover:text-primary">{publicHeadline(event.title)}</Link>
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">{isCurrent ? "Within 24h" : "Historical"} · {formatDate(event.publishedAt ?? event.createdAt)}</span>
                      <RiskBadge score={event.severity} showScore />
                    </div>
                  </>
                ) : (
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">No current verified scored assessment in the last 24 hours. No new severity is invented.</p>
                )}
              </article>
            ))}
          </div>
        </section>
        {currentObserved.length > 0 ? (
          <section className="mt-8" aria-labelledby="current-observation-heading">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Verified current monitoring</p>
            <h2 id="current-observation-heading" className="mt-1 text-xl font-semibold">New developments observed · not risk-scored</h2>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              These are independently admitted, time-stamped source-free observations. They do not have a Geomacro severity score until the separate classifier, source-rights and corroboration checks pass.
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {currentObserved.map((event) => (
                <article key={event.id} className="rounded-xl border border-border/70 bg-card/40 p-4">
                  <p className="font-mono text-[10px] uppercase tracking-wider text-primary">{prettyCategory(event.category ?? "")} · Verified observation</p>
                  <h3 className="mt-2 text-sm font-semibold leading-6">{publicHeadline(event.title)}</h3>
                  {event.summary ? <p className="mt-2 text-xs leading-5 text-muted-foreground">{event.summary.replace(/\s*\u2014\s*/gu, "; ")}</p> : null}
                  <p className="mt-3 text-xs text-muted-foreground">
                    Observed {formatDate(event.publishedAt ?? event.createdAt)} · Severity pending independent verification
                  </p>
                </article>
              ))}
            </div>
          </section>
        ) : null}
        <div className="mt-8 grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  {showHistoricalArchive ? "Dated historical archive" : "Current scored intelligence"}
                </p>
                <h2 className="mt-1 text-2xl font-semibold">
                  {showHistoricalArchive ? "Current and historical assessments" : "Current verified assessments"}
                </h2>
              </div>
              <div className="flex items-center gap-3">
                <p className="text-sm text-muted-foreground">{visibleFiltered.length} scored stor{visibleFiltered.length === 1 ? "y" : "ies"}</p>
                {historicalCount > 0 ? (
                  <Button type="button" variant="outline" size="sm" aria-pressed={showHistoricalArchive}
                    onClick={() => setShowHistoricalArchive((value) => !value)}>
                    {showHistoricalArchive ? "Hide historical archive" : `View historical archive (${historicalCount})`}
                  </Button>
                ) : null}
              </div>
            </div>

            {showHistoricalArchive ? (
              <p className="mb-4 text-sm text-muted-foreground">
                Previous verified risk assessments remain available for comparison. Their original evidence dates and historical severity scores are preserved; none should be read as a current alert.
              </p>
            ) : null}
            {visibleFiltered.length ? (
              <div className="grid gap-3">
                {visibleFiltered.slice(0, 24).map((event) => <IntelCard key={event.id} event={event} />)}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border p-8 text-center">
                <p className="font-medium">No current verified scored development</p>
                <p className="mt-2 text-sm text-muted-foreground">Use the dated archive to review previous assessments. New signals require independent corroboration and verified scoring.</p>
              </div>
            )}


          </div>

          <aside className="space-y-4" aria-label="Intelligence context">
            <div className="rounded-2xl border border-border/70 bg-card/40 p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Risk Indices</p>
                <Link to="/risk-indices" className="text-xs text-primary hover:underline">Open</Link>
              </div>
              {riskIndices.data ? (
                <div className="mt-4 space-y-3">
                  {riskIndices.data.indices.map((index) => (
                    <div key={index.key} className="border-b border-border/50 pb-3 last:border-0 last:pb-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-medium leading-5">{index.name}</p>
                          <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                            {index.eventCount} evidence · {index.independentStoryCount} stories
                          </p>
                        </div>
                        {index.status === "available" && index.score !== null ? (
                          <RiskBadge score={index.score} showScore />
                        ) : (
                          <span className="text-[10px] text-muted-foreground">Refreshing</span>
                        )}
                      </div>
                      {index.changePoints !== null ? (
                        <div className="mt-2"><RiskTrend delta={index.changePoints} /></div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : riskIndices.status === "error" ? (
                <div className="mt-4 rounded-lg border border-dashed border-border/70 p-4">
                  <p className="text-xs font-medium text-foreground">Risk Indices temporarily unavailable</p>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">No synthetic reading is shown while the verified package is unavailable.</p>
                  <Button type="button" variant="ghost" size="sm" onClick={riskIndices.retry} className="mt-2 h-8 px-2 text-xs">Retry</Button>
                </div>
              ) : (
                <div className="mt-4 space-y-3" aria-label="Refreshing verified risk indices">
                  {Array.from({ length: 3 }, (_, index) => (
                    <div key={index} className="h-12 animate-pulse rounded-lg bg-muted/30" />
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-border/70 bg-card/40 p-5">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Risk domains</p>
              <div className="mt-4 space-y-3">
                {COMMERCIAL_DOMAINS.filter(({ key }) => key === category).map(({ key: domain }) => {
                  const latest = latestScoredByCategory.get(domain) ?? null;
                  const visibleCount = selectedPool.filter((event) => event.category === domain).length;
                  return (
                    <div key={domain} className="flex items-start justify-between gap-3 border-b border-border/50 pb-3 last:border-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{prettyCategory(domain)}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {latest
                            ? `${latest.isCurrent ? "Latest verified score" : "Last verified score"} · ${formatDate(latest.publishedAt!)}`
                            : "Scored news unavailable"}
                        </p>
                        <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                          {visibleCount} scored stor{visibleCount === 1 ? "y" : "ies"}
                        </p>
                      </div>
                      {latest?.severity !== null && latest?.severity !== undefined ? (
                        <RiskBadge score={latest.severity} showScore />
                      ) : (
                        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Unavailable</span>
                      )}
                    </div>
                  );
                })}
              </div>
              {selectedLatestEvidenceAt ? (
                <p className="mt-4 border-t border-border/50 pt-3 text-xs leading-5 text-muted-foreground">
                  Latest original evidence {formatTime(selectedLatestEvidenceAt)}; monitoring or B2 restore time is not a new assessment. Earlier scores remain historical. Earlier assessments retain their original dates.
                </p>
              ) : null}
            </div>

            <div className="rounded-2xl border border-border/70 bg-card/40 p-5">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Ask Geomacro</p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Ask what changed, why it matters and which risk signals deserve attention.
              </p>
              <Button asChild variant="outline" className="mt-4 w-full gap-2">
                <Link to="/ask-geomacro">Ask a question <ArrowRight className="h-4 w-4" /></Link>
              </Button>
            </div>
          </aside>
        </div>
        </>
      )}
    </main>
  );
}

function IntelCard({ event }: { event: IntelEvent }) {
  if (event.publicStatus !== "verified_b2" || event.severity === null) return null;
  return (
    <article className="rounded-2xl border border-border/70 bg-card/40 p-5 transition hover:border-primary/40">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary">{event.category ? prettyCategory(event.category) : "Intelligence"}</span>
        <RiskBadge score={event.severity} showScore />
      </div>
      <h3 className="mt-3 text-lg font-semibold leading-snug">
        <Link to="/event/$eventId" params={{ eventId: event.id }} className="hover:text-primary">{publicHeadline(event.title)}</Link>
      </h3>
      {event.summary && <p className="mt-2 text-sm leading-6 text-muted-foreground">{event.summary.replace(/\s*\u2014\s*/gu, "; ")}</p>}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border/50 pt-3 text-xs text-muted-foreground">
        <span>{event.isCurrent ? "Current verified assessment" : "Historical verified assessment"} · {event.publishedAt ? formatDate(event.publishedAt) : "Original publication time unavailable"}</span>
        <div className="flex items-center gap-3">
          {event.delta !== null && event.delta !== 0 ? <RiskTrend delta={Math.round(event.delta)} /> : null}
          <Link to="/event/$eventId" params={{ eventId: event.id }} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">Open assessment <ArrowRight className="h-3 w-3" /></Link>
        </div>
      </div>
    </article>
  );
}

function LoadingGrid() {
  return (
    <div className="mt-8 grid gap-4 md:grid-cols-2">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="h-[230px] animate-pulse rounded-2xl border border-border/60 bg-card/30" />
      ))}
    </div>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unknown time";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" }).format(date);
}

function formatTime(value: number) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit", timeZone: "UTC", timeZoneName: "short" }).format(date);
}
