import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Radio, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RiskBadge, RiskScore, RiskTrend } from "@/components/foundation/risk";
import { RiskChart } from "@/components/home/risk-chart";
import {
  applyIntelFilters,
  availableSorts,
  prettyCategory,
  useIntelligence,
  type IntelEvent,
  type IntelSort,
} from "@/lib/use-intelligence";
import { useGlobalRisk } from "@/lib/use-global-risk";

const TITLE = "Risk Intelligence · Geomacro";
const DESCRIPTION =
  "Follow current geopolitical and macro risk with scored events, evidence, timestamps, the current GRI and filters for professional research.";

export const Route = createFileRoute("/intelligence")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://geomacro.live/intelligence" },
      { property: "og:image", content: "https://geomacro.live/og-signal-card-v2.png" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://geomacro.live/intelligence" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "Geomacro Risk Intelligence",
          url: "https://geomacro.live/intelligence",
          description: DESCRIPTION,
          isPartOf: { "@type": "WebSite", name: "Geomacro", url: "https://geomacro.live/" },
        }),
      },
    ],
  }),
  component: IntelligencePage,
});

function IntelligencePage() {
  const intel = useIntelligence();
  const globalRisk = useGlobalRisk();
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<IntelSort>("risk");

  const pool = intel.data?.all ?? [];
  const available = useMemo(() => availableSorts(pool), [pool]);
  const activeSort = available.includes(sort) ? sort : "risk";
  const filtered = useMemo(
    () => applyIntelFilters(pool, { category, query, sort: activeSort }),
    [pool, category, query, activeSort],
  );
  const series = globalRisk.data?.series["7D"]?.buckets ?? null;

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 md:py-12">
      <header className="max-w-4xl">
        <div className="flex flex-wrap items-center gap-3 font-mono text-[10px] uppercase tracking-[0.16em]">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-primary">
            <Radio className="h-3 w-3" aria-hidden /> LIVE INTELLIGENCE
          </span>
          <span className="text-muted-foreground">
            {intel.status === "updating" ? "Updating" : intel.updatedAt ? `Updated ${formatTime(intel.updatedAt)}` : "Current feed"}
          </span>
        </div>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">Risk Intelligence</h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg">
          Follow the geopolitical and macro developments currently shaping risk. Each event keeps its recorded score, movement, source context and timestamp so you can inspect the underlying record rather than a separate display-only ranking.
        </p>
        <p className="mt-3 text-sm text-muted-foreground">You do not need a wallet to read or research this intelligence.</p>
      </header>

      <section className="mt-8 grid gap-3 rounded-2xl border border-border/70 bg-card/40 p-4 sm:grid-cols-[minmax(0,1fr)_180px_170px_auto]">
        <label className="relative min-w-0">
          <span className="sr-only">Search intelligence</span>
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search events, sources or categories"
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
            <option value="risk">Highest risk</option>
            <option value="newest">Newest</option>
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
        <div className="mt-8 grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Current event set</p>
                <h2 className="mt-1 text-2xl font-semibold">
                  {query.trim() || category !== "all" ? "Matching intelligence" : "Highest-priority intelligence"}
                </h2>
              </div>
              <p className="text-sm text-muted-foreground">{filtered.length} matching event{filtered.length === 1 ? "" : "s"}</p>
            </div>

            {filtered.length ? (
              <div className="grid gap-4 md:grid-cols-2">
                {filtered.slice(0, 24).map((event) => <IntelCard key={event.id} event={event} />)}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border p-8 text-center">
                <p className="font-medium">No matching intelligence</p>
                <p className="mt-2 text-sm text-muted-foreground">Try a broader search or a different category.</p>
              </div>
            )}
          </div>

          <aside className="space-y-4" aria-label="Intelligence context">
            <div className="rounded-2xl border border-border/70 bg-card/40 p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Global Risk Index</p>
                <Link to="/global-risk" className="text-xs text-primary hover:underline">Verify</Link>
              </div>
              {globalRisk.data ? (
                <>
                  <RiskScore score={globalRisk.data.score} size="md" className="mt-3" />
                  {globalRisk.data.previous !== null ? (
                    <div className="mt-3">
                      <RiskTrend delta={Math.round(globalRisk.data.score - globalRisk.data.previous)} />
                    </div>
                  ) : null}
                  {series && series.length > 1 ? (
                    <RiskChart buckets={series} label="Verified GRI, last 7 days" height={150} className="mt-5" />
                  ) : (
                    <p className="mt-4 text-xs text-muted-foreground">Verified history appears when enough snapshots are available.</p>
                  )}
                  <dl className="mt-5 grid grid-cols-2 gap-3 text-xs">
                    <Metric label="Evidence" value={String(globalRisk.data.eventCount)} />
                    <Metric label="Stories" value={String(globalRisk.data.independentStoryCount)} />
                    <Metric label="Sources" value={globalRisk.data.sourceCount === null ? "—" : String(globalRisk.data.sourceCount)} />
                    <Metric label="Coverage" value={`${Math.round(globalRisk.data.coverage * 100)}%`} />
                  </dl>
                </>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">Verified GRI snapshot unavailable.</p>
              )}
            </div>

            <div className="rounded-2xl border border-border/70 bg-card/40 p-5">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Risk domains</p>
              <div className="mt-4 space-y-3">
                {intel.data.categoryCounts.map((item) => (
                  <div key={item.category} className="flex items-center justify-between gap-3 border-b border-border/50 pb-3 last:border-0 last:pb-0">
                    <div>
                      <p className="text-sm font-medium">{prettyCategory(item.category)}</p>
                      <p className="text-xs text-muted-foreground">{item.count} event{item.count === 1 ? "" : "s"}</p>
                    </div>
                    <RiskBadge score={item.avgSeverity} showScore />
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-border/70 bg-card/40 p-5">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Ask Geomacro</p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Ask a question using the same stored intelligence and current verified GRI shown here.
              </p>
              <Button asChild variant="outline" className="mt-4 w-full gap-2">
                <Link to="/ask-geomacro">Ask a question <ArrowRight className="h-4 w-4" /></Link>
              </Button>
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}

function IntelCard({ event }: { event: IntelEvent }) {
  return (
    <article className="flex min-h-[230px] flex-col rounded-2xl border border-border/70 bg-card/40 p-5 transition hover:border-primary/30">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          {event.category ? prettyCategory(event.category) : "Uncategorised"}
        </span>
        {event.severity !== null ? <RiskBadge score={event.severity} showScore /> : null}
      </div>
      <h3 className="mt-4 text-base font-semibold leading-snug">
        <Link to="/event/$eventId" params={{ eventId: event.id }} className="hover:text-primary">
          {event.title}
        </Link>
      </h3>
      {event.summary ? <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-muted-foreground">{event.summary}</p> : null}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-5 text-xs text-muted-foreground">
        <span>{event.sourceName ?? "Source recorded"} · {formatDate(event.publishedAt ?? event.createdAt)}</span>
        {event.delta !== null && event.delta !== 0 ? <RiskTrend delta={Math.round(event.delta)} /> : null}
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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/30 p-3">
      <dt className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-mono text-sm text-foreground">{value}</dd>
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
