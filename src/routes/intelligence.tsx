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
  prettyCategory,
  useIntelligence,
  type IntelEvent,
  type IntelSort,
} from "@/lib/use-intelligence";
import { getPublicIntelligenceSeo } from "@/lib/public-intelligence-seo.functions";
import { useRiskIndices } from "@/lib/use-risk-indices";
import { withPublicRuntimeTimeout } from "@/lib/public-runtime-timeout";
import { categoryLeads, publicHeadline, scoredNews, COMMERCIAL_DOMAINS } from "@/lib/intelligence-editorial";

const TITLE = "Live Geopolitical, Macro & Critical Minerals Risk Intelligence | Geomacro";
const DESCRIPTION = "Source-governed geopolitical, macro/FX and critical minerals intelligence: specific scored events, decision context and verified severity from 0 to 100.";
const URL = "https://geomacro.live/intelligence";
const IMAGE = "https://geomacro.live/og-signal-card-v2.png";

export const Route = createFileRoute("/intelligence")({
  loader: async () => {
    const now = Date.now();
    try {
      const rows = await withPublicRuntimeTimeout(
        getPublicIntelligenceSeo({ data: {} }),
        6_000,
        "Intelligence route preload timed out.",
      );
      return { rows, now };
    } catch (error) {
      console.error(
        "[intelligence-route] preload failed; rendering fail-closed workspace",
        error instanceof Error ? error.message : String(error),
      );
      return { rows: [], now };
    }
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
  component: IntelligencePage,
});

function IntelligencePage() {
  const loaderData = Route.useLoaderData();
  const initialData = useMemo(
    () => loaderData.rows.length ? buildPublicIntelligence(loaderData.rows, loaderData.now) : null,
    [loaderData.now, loaderData.rows],
  );
  const intel = useIntelligence(initialData);
  const riskIndices = useRiskIndices();
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<IntelSort>("newest");

  const pool = useMemo(() => scoredNews(intel.data?.all ?? []), [intel.data]);
  const leads = useMemo(() => categoryLeads(pool), [pool]);
  const currentScored = pool.some((event) => event.isCurrent);
  const available = useMemo(() => availableSorts(pool), [pool]);
  const activeSort = available.includes(sort) ? sort : "newest";
  const filtered = useMemo(
    () => applyIntelFilters(pool, { category, query, sort: activeSort }),
    [pool, category, query, activeSort],
  );
  const latestVerifiedFallback = pool.length > 0 && !currentScored;
  const previous = pool.filter((event) => !event.isCurrent).slice(0, 8);
  const latestScoredByCategory = useMemo(() => {
    const latest = new Map<string, IntelEvent>();
    for (const event of pool) {
      if (event.publicStatus !== "verified_b2" || event.severity === null || !event.category) continue;
      const eventTime = Date.parse(event.publishedAt ?? event.createdAt);
      if (!Number.isFinite(eventTime)) continue;
      const existing = latest.get(event.category);
      const existingTime = existing ? Date.parse(existing.publishedAt ?? existing.createdAt) : -Infinity;
      if (!existing || !Number.isFinite(existingTime) || eventTime > existingTime) {
        latest.set(event.category, event);
      }
    }
    return latest;
  }, [pool]);

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 md:py-12">
      <header className="max-w-4xl">
        <div className="flex flex-wrap items-center gap-3 font-mono text-[10px] uppercase tracking-[0.16em]">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-primary">
            <Radio className="h-3 w-3" aria-hidden /> {latestVerifiedFallback ? "PREVIOUSLY VERIFIED" : currentScored ? "CURRENT SCORED INTELLIGENCE" : "AWAITING VERIFIED STORIES"}
          </span>
          <span className="text-muted-foreground">
            {intel.status === "updating" ? "Updating" : latestVerifiedFallback
              ? "Historical scores preserved while fresh assessments are prepared"
              : currentScored ? "Fresh verified scored developments" : "No eligible scored headlines yet"}
          </span>
        </div>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">Risk Intelligence</h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg">
          What changed, why it matters, and how significant is the risk? Explore verified, scored news across geopolitics, Macro/FX and critical minerals. Every assessment retains its original date.
        </p>
        <p className="mt-3 text-sm text-muted-foreground">Free to browse. For structured API delivery or monthly intelligence access, <Link to="/pricing" className="font-medium text-primary hover:underline">compare access options</Link>.</p>
      </header>

      <section className="mt-8 grid gap-3 rounded-2xl border border-border/70 bg-card/40 p-4 sm:grid-cols-[minmax(0,1fr)_180px_170px_auto]">
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
          <span className="sr-only">Category</span>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
          >
            <option value="all">All categories</option>
            {(intel.data?.categories ?? []).map((item) => (
              <option key={item} value={item}>{prettyCategory(item)}</option>
            ))}
          </select>
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
          <h2 id="domain-leads-heading" className="mt-1 text-2xl font-semibold">Leading verified developments</h2>
          <p className="mt-1 text-sm text-muted-foreground">One leading scored development per domain, ranked from the verified feed. Historical stories are dated, never passed off as breaking news.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {leads.map(({ key, label, event, isCurrent }) => (
              <article key={key} className="flex flex-col rounded-xl border border-border/70 bg-card/50 p-4">
                <p className="font-mono text-[10px] uppercase tracking-widest text-primary">{label}</p>
                {event && event.severity !== null ? (
                  <>
                    <Link to="/event/$eventId" params={{ eventId: event.id }} className="mt-3 flex-1 text-sm font-semibold leading-6 hover:text-primary">{publicHeadline(event.title)}</Link>
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">{isCurrent ? "Within 24h" : "Historical"} · {formatDate(event.publishedAt ?? event.createdAt)}</span>
                      <RiskBadge score={event.severity} showScore />
                    </div>
                  </>
                ) : (
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">No eligible verified scored story yet. No event or severity has been invented.</p>
                )}
              </article>
            ))}
          </div>
        </section>
        <div className="mt-8 grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  {latestVerifiedFallback ? "Historical verified assessments" : "Scored news intelligence"}
                </p>
                <h2 className="mt-1 text-2xl font-semibold">
                  {query.trim() || category !== "all" ? "Matching scored stories" : latestVerifiedFallback ? "Latest verified assessments" : "Verified intelligence feed"}
                </h2>
              </div>
              <p className="text-sm text-muted-foreground">{filtered.length} scored stor{filtered.length === 1 ? "y" : "ies"}</p>
            </div>

            {filtered.length ? (
              <div className="grid gap-3">
                {filtered.slice(0, 24).map((event) => <IntelCard key={event.id} event={event} />)}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border p-8 text-center">
                <p className="font-medium">No matching scored news</p>
                <p className="mt-2 text-sm text-muted-foreground">Try a broader search. Unscored classifier observations are excluded until verified scoring completes.</p>
              </div>
            )}

            {!query.trim() && category === "all" && previous.length > 0 ? (
              <section className="mt-10 border-t border-border/60 pt-8" aria-labelledby="verified-risk-context-heading">
                <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Earlier intelligence</p>
                    <h2 id="verified-risk-context-heading" className="mt-1 text-2xl font-semibold">Previous risk assessments</h2>
                    <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                      Previous verified risk assessments remain available for comparison. Their dates are preserved, and they are not presented as today&apos;s risk conditions.
                    </p>
                  </div>
                  <p className="text-sm text-muted-foreground">{previous.length} verified record{previous.length === 1 ? "" : "s"}</p>
                </div>
                <div className="grid gap-3">
                  {previous.map((event) => <IntelCard key={`verified-context-${event.id}`} event={event} />}
                </div>
              </section>
            ) : null}
          </div>

          <aside className="space-y-4" aria-label="Intelligence context">
            <div className="rounded-2xl border border-border/70 bg-card/40 p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Risk Indices</p>
                <Link to="/global-risk" className="text-xs text-primary hover:underline">Open</Link>
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
                {COMMERCIAL_DOMAINS.map(({ key: domain }) => {
                  const latest = latestScoredByCategory.get(domain) ?? null;
                  const visibleCount = pool.filter((event) => event.category === domain).length;
                  return (
                    <div key={domain} className="flex items-start justify-between gap-3 border-b border-border/50 pb-3 last:border-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{prettyCategory(domain)}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {latest
                            ? `${latest.isCurrent ? "Latest verified score" : "Last verified score"} · ${formatDate(latest.publishedAt ?? latest.createdAt)}`
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
              {intel.updatedAt ? (
                <p className="mt-4 border-t border-border/50 pt-3 text-xs leading-5 text-muted-foreground">
                  Monitoring updated {formatTime(intel.updatedAt)}; scored news may be older. Earlier assessments retain their original dates.
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
      {event.summary && <p className="mt-2 text-sm leading-6 text-muted-foreground">{event.summary}</p>}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border/50 pt-3 text-xs text-muted-foreground">
        <span>{event.isCurrent ? "Current verified assessment" : "Historical verified assessment"} · {formatDate(event.publishedAt ?? event.createdAt)}</span>
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
