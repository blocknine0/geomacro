import {hasConcreteNewsFacts,mergeNewsRevisions} from "@/lib/news-event-facts";
import { useEffect, useRef, useState } from "react";
import { AlertCircle, Clock3, RefreshCw, Search } from "lucide-react";
import { getStatelessIntelligence } from "@/lib/stateless-intelligence.functions";
import { getWebsiteDerivedNews } from "@/lib/website-derived-news.functions";
import { fetchAllDerivedNews } from "@/lib/public-derived-news-client";
import { findCardFromObservedRelease } from "@/lib/find-card-v1";
import { withPublicRuntimeTimeout } from "@/lib/public-runtime-timeout";
import type { StatelessIntelligenceResult } from "@/lib/stateless-public-intelligence.server";
import type { StatelessCategory, StatelessIntelligenceSignal } from "@/lib/stateless-intelligence-model";

const DOMAINS: readonly { key: StatelessCategory; label: string }[] = [
  { key: "geopolitics", label: "Geopolitics" },
  { key: "macro", label: "Macro / FX" },
  { key: "rare_earth", label: "Critical Minerals" },
];
const displayProse = (text: string) => text.replace(/\s*\u2014\s*/gu, "; ");
const REFRESH_MS = 2 * 60_000;
// Three complete pages per six minutes use the same bounded mean request rate
// as the previous single page every two minutes, without silently dropping 350 rows.
const JOURNAL_REFRESH_MS = 6 * 60_000;
const OGL_URL = "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/";
type FeedState = Partial<Record<StatelessCategory, StatelessIntelligenceResult>>;
// Stable default avoids restarting fetch effects when legacy callers omit this prop.
const EMPTY_FEEDS: FeedState = Object.freeze({});
import {filterIntelligenceDesk,INTELLIGENCE_PAGE_SIZE,type IntelligenceDeskView as View,type IntelligenceDeskPeriod} from "@/lib/intelligence-desk-view";

function labelFor(category: StatelessCategory): string {
  return DOMAINS.find(domain => domain.key === category)?.label ?? category;
}

function formatInstant(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    const date = Date.parse(value + "T00:00:00.000Z");
    return Number.isFinite(date)
      ? new Intl.DateTimeFormat("en-GB", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }).format(date) +
        " · original publisher date only"
      : "Original publication date unavailable";
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp)
    ? new Intl.DateTimeFormat("en-GB", {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit", timeZone: "UTC",
    }).format(timestamp) + " UTC"
    : "Original publication time unavailable";
}

function Story({ signal, checkedAt }: {signal: StatelessIntelligenceSignal;checkedAt: number}) {
  const isCurrent = Date.parse(signal.published_at) >= checkedAt - 86_400_000;
  const card = findCardFromObservedRelease(signal, checkedAt);
  return (
    <article data-testid={card ? "geomacro-find-card-v1" : "geomacro-release-finding"}
      data-geomacro-story-id={signal.id}
      className="min-w-0 rounded-2xl border border-border/75 bg-card/65 p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
        <span className="font-mono font-semibold uppercase tracking-wider text-primary">{labelFor(signal.category)}</span>
        <span aria-hidden>·</span><time dateTime={signal.published_at}>{formatInstant(signal.published_at)}</time>
        {!isCurrent ? <span className="rounded-full border border-border px-2 py-0.5">Earlier release</span> : null}
      </div>
      <p className="mt-3 text-xs font-medium text-muted-foreground">Country or region: {displayProse(signal.geography ?? "Not specified in the release")}</p>
      <h3 className="mt-3 text-lg font-semibold leading-snug tracking-tight">{displayProse(signal.title.replace(/^Geomacro finds\s+/iu, ""))}</h3>
      <p className="mt-3 text-sm leading-6">{displayProse(signal.what_changed)}</p>
      {card?.detail_state === "LIMITED" ? <p className="mt-2 text-xs text-muted-foreground">Specific details not captured</p> : null}
      <details className="mt-4 border-t border-border/60 pt-3">
        <summary className="cursor-pointer py-1 text-xs font-semibold text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">Why it matters &amp; what to watch</summary>
        <div className="mt-3 space-y-4 text-sm leading-6 text-muted-foreground">
          <div><h4 className="text-xs font-semibold uppercase tracking-wider text-foreground">Why it matters</h4><p className="mt-1">{displayProse(signal.why_it_matters)}</p></div>
          {card ? <div><h4 className="text-xs font-semibold uppercase tracking-wider text-foreground">Watch next</h4><p className="mt-1">{displayProse(card.watch_next.text)}</p></div> : null}
          {card?.detail_state === "FULL" && card.facts.length > 0 ? <dl className="grid gap-2 sm:grid-cols-2">{card.facts.map((fact,index)=><div key={index}><dt className="text-xs">{fact.label}</dt><dd className="font-medium text-foreground">{fact.value}{fact.unit ? " " + fact.unit : ""}</dd></div>)}</dl> : null}
          <p className="text-xs">Original release observed · No independent corroboration or risk score claimed</p>
        </div>
      </details>
      {signal.sources_credited.length > 0 ? <div className="mt-3 border-t border-border/50 pt-3 text-[11px] leading-5 text-muted-foreground">{signal.sources_credited.map(credit=><p key={credit}>Required credit: {displayProse(credit)}{credit.includes("Open Government Licence") ? <> · <a href={OGL_URL} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">Licence</a></> : null}</p>)}</div> : null}
    </article>
  );
}

/**
 * A continuously refreshing, genuinely three-domain browser desk.
 *
 * The first visit immediately starts requesting the other two categories
 * in parallel with the SSR-provided Geopolitics result. Every visible tab
 * refreshes ALL three sources at 2-minute intervals. There is no cron,
 * database, queue, browser storage, service worker or durable history.
 *
 * Upstream failures never become fake "no news" claims: last in-tab data
 * is explicitly marked temporarily unverified and its check time remains
 * unchanged until a new real publisher check completes successfully.
 */
export function StatelessLiveDesk({ initial, initialFeeds = EMPTY_FEEDS, initialJournal = [], initialView = "geopolitics" }: {
  initial: StatelessIntelligenceResult | null;
  initialFeeds?: FeedState;
  initialJournal?: StatelessIntelligenceSignal[];
  initialView?: View;
}) {
  const [view, setView] = useState<StatelessCategory>(initialView === "all" ? "geopolitics" : initialView);
  const [query, setQuery] = useState("");
  const [period, setPeriod] = useState<IntelligenceDeskPeriod>("all");
  const [visibleCount, setVisibleCount] = useState(INTELLIGENCE_PAGE_SIZE);
  useEffect(() => setView(initialView === "all" ? "geopolitics" : initialView), [initialView]);
  useEffect(() => setVisibleCount(INTELLIGENCE_PAGE_SIZE), [view, query, period]);
  // SSR can now load all three issuer categories independently. Do not erase
  // valid server-published Macro/Minerals on the first browser hydration or
  // wait for a second network roundtrip to fill two empty category counters.
  const [feeds, setFeeds] = useState<FeedState>(() => ({
    ...(initial?.category === "geopolitics" && initial.healthy_feed_count > 0
      ? { geopolitics: initial } : {}),
    ...initialFeeds,
  }));
  const [errors, setErrors] = useState<Partial<Record<StatelessCategory, boolean>>>({});
  // Server loader supplies already verified derived cards for the first HTML paint.
  const [journal, setJournal] = useState<StatelessIntelligenceSignal[]>(() => initialJournal);
  const [journalUnavailable, setJournalUnavailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const lastRequestAt = useRef(0);
  const manualRefresh = useRef<() => void>(() => undefined);
  const manualJournalRefresh = useRef<() => void>(() => undefined);

  useEffect(() => {
    let alive = true;
    const refresh = async (categories: readonly StatelessCategory[]) => {
      if (inFlight.current) return;
      inFlight.current = true;
      lastRequestAt.current = Date.now();
      if (alive) setBusy(true);
      try {
        const results = await Promise.allSettled(categories.map(async category => ({
          category,
          value: await withPublicRuntimeTimeout(
            getStatelessIntelligence({ data: { category } }),
            9_000,
            "Intelligence publisher check timed out.",
          ),
        })));
        if (!alive) return;
        const nextFeeds: FeedState = {};
        const nextErrors: Partial<Record<StatelessCategory, boolean>> = {};
        results.forEach((result, index) => {
          const category = categories[index];
          if (result.status === "fulfilled" &&
              result.value.value.category === category &&
              result.value.value.healthy_feed_count > 0) {
            nextFeeds[category] = result.value.value;
            nextErrors[category] = false;
          } else {
            nextErrors[category] = true;
          }
        });
        // In-memory tab continuity only, never B2/Supabase/D1/browser-durable storage.
        setFeeds(previous => ({ ...previous, ...nextFeeds }));
        setErrors(previous => ({ ...previous, ...nextErrors }));
      } finally {
        inFlight.current = false;
        if (alive) setBusy(false);
      }
    };

    // Initial HTML now has all source categories that were healthy at
    // render time. Only fetch failed/missing categories immediately. This
    // prevents six redundant official-feed HTTP reads on first hydration.
    const initiallyHealthy = new Set<StatelessCategory>(
      Object.entries(initialFeeds)
        .filter(([, value]) => value && value.healthy_feed_count > 0)
        .map(([category]) => category as StatelessCategory)
    );
    if (initial?.category === "geopolitics" && initial.healthy_feed_count > 0)
      initiallyHealthy.add("geopolitics");
    const missingAtSsr = DOMAINS.map(domain => domain.key)
      .filter(category => !initiallyHealthy.has(category));
    if (missingAtSsr.length > 0) void refresh(missingAtSsr);
    manualRefresh.current = () => { void refresh(["geopolitics", "macro", "rare_earth"]); };
    const refreshAll = () => {
      if (document.visibilityState === "visible") {
        void refresh(["geopolitics", "macro", "rare_earth"]);
      }
    };
    const onReturn = () => {
      if (document.visibilityState === "visible" &&
          Date.now() - lastRequestAt.current > REFRESH_MS / 2) refreshAll();
    };
    const interval = window.setInterval(refreshAll, REFRESH_MS);
    document.addEventListener("visibilitychange", onReturn);
    window.addEventListener("focus", onReturn);
    return () => {
      alive = false;
      manualRefresh.current = () => undefined;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onReturn);
      window.removeEventListener("focus", onReturn);
    };
  }, [initial, initialFeeds]);

  // Durable source-neutral 72-hour D1 journal, verified across every bounded page.
  useEffect(() => {
    let alive = true;
    let pending = false;
    const sync = async () => {
      if (pending) return;
      pending = true;
      try {
      // Browser-direct D1 is crucial when a Lovable server-function roundtrip
      // fails despite the verified, public, source-private D1 journal.
      try {
        const signals = await fetchAllDerivedNews();
        if (alive) { setJournal(signals); setJournalUnavailable(false); }
      } catch {
        // The legacy server function is only a secondary fallback; preserve
        // previously rendered SSR or in-tab cards if BOTH paths fail.
        try {
          const result = await withPublicRuntimeTimeout(
            getWebsiteDerivedNews(),
            9_000,
            "Intelligence journal fallback timed out.",
          );
          if (alive) { setJournal(result.signals); setJournalUnavailable(true); }
        } catch { if (alive) setJournalUnavailable(true); }
      }
      } finally { pending = false; }
    };
    manualJournalRefresh.current = () => { void sync(); };
    void sync();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void sync();
    }, JOURNAL_REFRESH_MS);
    const onReturn = () => { if (document.visibilityState === "visible") void sync(); };
    document.addEventListener("visibilitychange", onReturn);
    return () => {
      alive = false;
      manualJournalRefresh.current = () => undefined;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onReturn);
    };
  }, []);

  // Human-readable timeline across all three categories, newest first.
  // Day-only originals sort by their actual date, never an invented hour.
  const known = DOMAINS.filter(domain => feeds[domain.key]);
  const merged = mergeNewsRevisions(journal,known.flatMap(domain=>feeds[domain.key]?.signals??[]));
  const checkedAt = Date.now();
  const allSignals = filterIntelligenceDesk([...merged.values()].filter(hasConcreteNewsFacts), {category:"all",query:"",period:"all"}, checkedAt);
  const pendingDetails = [...merged.values()].filter(signal=>signal.category===view&&!hasConcreteNewsFacts(signal)).length;
  const categorySignals = allSignals.filter(signal => signal.category === view);
  const signals = filterIntelligenceDesk(allSignals, {category:view,query,period}, checkedAt);
  const recentCount = categorySignals.filter(signal => Date.parse(signal.published_at) >= checkedAt - 86_400_000).length;
  const shown = signals.slice(0, visibleCount);
  const recent = shown.filter(signal => Date.parse(signal.published_at) >= checkedAt - 86_400_000);
  const earlier = shown.filter(signal => Date.parse(signal.published_at) < checkedAt - 86_400_000);
  const active = DOMAINS.filter(domain => domain.key === view);
  const incomplete = active.filter(domain => errors[domain.key] || feeds[domain.key]?.healthy_feed_count === 0);
  const latestCheck = Math.max(0, ...active.map(domain =>
    Date.parse(feeds[domain.key]?.checked_at ?? "") || 0));
  const missing = active.filter(domain => !feeds[domain.key] && !errors[domain.key]);
  const refreshOnClick = () => { manualRefresh.current(); manualJournalRefresh.current(); };

  return (
    <main data-testid="geomacro-derived-news-desk" className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 md:py-12">
      <header className="max-w-3xl">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
          GEOMACRO FINDS · LIVE INTELLIGENCE DESK
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
          What changed in the world
        </h1>
        <p className="mt-4 text-base leading-7 text-muted-foreground">
          What changed, why it matters and what to watch across Geopolitics, Macro/FX and
          Critical Minerals. Original publication dates stay visible. Findings are unscored.
        </p>
        <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Clock3 className="h-4 w-4" aria-hidden />
          <span>15-minute public delay · Original sources rechecked while open · Full stored journal refreshed every 6 minutes</span>
        </p>
      </header>

      <section className="mt-8" aria-label="Intelligence category">
        <h2 className="text-sm font-semibold">Browse findings</h2>
        <div role="group" aria-label="Intelligence category"
          className="mt-3 flex flex-wrap gap-2">
          {DOMAINS.map(domain => (
            <button key={domain.key} type="button" aria-pressed={view === domain.key}
              onClick={() => setView(domain.key)}
              className={"min-h-11 rounded-xl border px-4 py-2 text-sm font-semibold " +
                (view === domain.key ? "border-primary bg-primary text-primary-foreground" :
                  "border-border bg-card hover:border-primary/60")}>
              {domain.label}
              <span className="ml-2 text-xs opacity-80">{allSignals.some(signal => signal.category === domain.key) ? allSignals.filter(signal => signal.category === domain.key).length : feeds[domain.key] ? 0 : errors[domain.key] ? "Unavailable" : "…"}</span>
            </button>
          ))}
        </div>
      </section>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="flex min-h-11 flex-1 items-center gap-2 rounded-xl border border-border bg-card px-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="sr-only">Search findings by country or topic</span>
          <input type="search" value={query} maxLength={120} onChange={event=>setQuery(event.target.value)} placeholder="Search a country, topic or development" className="min-w-0 flex-1 bg-transparent py-3 text-sm outline-none" />
        </label>
        <label className="flex min-h-11 items-center gap-2 rounded-xl border border-border bg-card px-3 text-xs text-muted-foreground">
          Publication window
          <select value={period} onChange={event=>setPeriod(event.target.value as IntelligenceDeskPeriod)} className="bg-card py-3 text-sm text-foreground" aria-label="Filter by publication time">
            <option value="all">All available releases</option><option value="24h">Last 24 hours</option><option value="7d">Last 7 days</option>
          </select>
        </label>
      </div>

      <section className="mt-8" aria-labelledby="stateless-updates-heading">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">
              Latest Geomacro finds
            </p>
            <h2 id="stateless-updates-heading" className="mt-1 text-2xl font-semibold">
              {labelFor(view) + " developments"}
            </h2>
            <p role="status" className="mt-2 text-xs text-muted-foreground">
              {allSignals.length === 0
                ? "Reading the 72-hour stored derived-news journal below"
                : recentCount + " in the last 24 hours · " +
                  (categorySignals.length - recentCount) + " earlier (original-dated)"}
              {latestCheck ? " · Latest source check " + formatInstant(new Date(latestCheck).toISOString()) : ""}
            </p>
          </div>
          <button type="button" onClick={refreshOnClick} disabled={busy}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium hover:bg-muted disabled:opacity-50">
            <RefreshCw className={"h-4 w-4 " + (busy ? "animate-spin" : "")} aria-hidden />
            {busy ? "Checking" : "Refresh"}
          </button>
        </div>

        {pendingDetails>0?<p role="status" className="mt-4 text-xs text-muted-foreground">
          {pendingDetails} additional {pendingDetails===1?"release awaits":"releases await"} specific event details.
        </p>:null}
        {missing.length > 0 ? (
          <p role="status" className="mt-4 text-sm text-muted-foreground">
            Loading {missing.map(x => x.label).join(", ")} from live official publishers…
          </p>
        ) : null}
        {incomplete.length > 0 ? (
          <p role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-border px-4 py-3 text-sm text-muted-foreground">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            Latest recheck failed for {incomplete.map(x => x.label).join(", ")}.
            Previously received in-tab findings may be out of date; no synthetic stories are shown.
          </p>
        ) : null}

        {allSignals.length === 0 && merged.size === 0 ? (
          <section aria-label="Direct verified Intelligence archive" className="mt-6">
            <p className="mb-3 text-xs text-muted-foreground">
              Reading the continuity feed while the main timeline reconnects.
            </p>
            <iframe
              title="Geomacro Finds · latest original-dated Intelligence"
              src="https://geomacro-control-plane.daspallab202391.workers.dev/v1/public/website-derived-news-html"
              loading="eager"
              referrerPolicy="no-referrer"
              className="w-full rounded-xl border border-border"
              style={{ height: "850px" }}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              <a className="underline underline-offset-2"
                href="https://geomacro-control-plane.daspallab202391.workers.dev/v1/public/website-derived-news-html"
                rel="noopener noreferrer" target="_blank">
                Open the continuity feed
              </a>
            </p>
          </section>
        ) : null}
        {journalUnavailable ? (
          <p role="status" className="mt-4 text-xs text-muted-foreground">
            The complete journal is temporarily unreachable; fallback findings may be incomplete. Original-source checks remain active;
            no old finding is relabeled as newly published.
          </p>
        ) : null}
        {signals.length > 0 ? (
          <div className="mt-6 space-y-8" aria-live="polite" aria-atomic="false">
            {recent.length > 0 ? (
              <section><h3 className="mb-3 text-sm font-semibold">New in the last 24 hours</h3><div className="grid items-start gap-4 lg:grid-cols-2">{recent.map(signal => <Story key={signal.id} signal={signal} checkedAt={checkedAt} />)}</div></section>
            ) : (
              <p className="text-sm text-muted-foreground">
                No verified original release from this view in the last 24 hours.
              </p>
            )}
            {earlier.length > 0 ? (
              <section><h3 className="mb-3 text-sm font-semibold">Earlier original releases · Dated</h3><div className="grid items-start gap-4 lg:grid-cols-2">{earlier.map(signal => <Story key={signal.id} signal={signal} checkedAt={checkedAt} />)}</div></section>
            ) : null}
          </div>
        ) : missing.length === 0 ? (
          <p role="status" className="mt-6 rounded-xl border border-dashed border-border px-5 py-6 text-sm text-muted-foreground">
            No findings match this category, search and publication window.
            Source availability does not prove the absence of real-world events.
          </p>
        ) : null}

        {signals.length > 0 ? <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
          <p role="status" className="text-xs text-muted-foreground">Showing {shown.length} of {signals.length} matching findings</p>
          {shown.length < signals.length ? <button type="button" onClick={()=>setVisibleCount(count=>count+INTELLIGENCE_PAGE_SIZE)} className="min-h-11 rounded-xl border border-border px-5 text-sm font-medium hover:bg-muted">Show more findings</button> : null}
        </div> : null}
        <p className="mt-8 text-xs leading-6 text-muted-foreground">
          Dates describe the original publication, not the last refresh. Earlier findings remain
          clearly dated. A publisher release alone does not establish a verified real-world outcome.
          The stored 72-hour derived-news journal also powers a
          <a className="mx-1 underline underline-offset-2" href="https://geomacro-control-plane.daspallab202391.workers.dev/v1/public/derived-structural-72h" target="_blank" rel="noopener noreferrer">structured research feed</a>
          for machine evaluation, including the Predge pilot. It is unscored and not licensed for partner resale.
          Required credits are retained on the website; raw articles and source feeds are not delivered.
        </p>
      </section>
    </main>
  );
}
