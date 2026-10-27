import {MacroFastlanePanel} from "./macro-fastlane-panel";
import { useEffect, useRef, useState } from "react";
import { AlertCircle, Bookmark, Clock3, RefreshCw, Search, Globe2, TrendingUp, Gem } from "lucide-react";
import { getStatelessIntelligence } from "@/lib/stateless-intelligence.functions";
import { fetchDirectDerivedNews, fetchPermanentDerivedNews } from "@/lib/public-derived-news-client";
import {isConcretePublicIntelligence,concreteGeomacroAnalysis,concreteIntelligenceHeadline,intelligenceRequiredSourceCredits} from "@/lib/intelligence-concrete-publication";
import {dedupeIntelligenceStories} from "@/lib/intelligence-news-dedupe";
import {intelligenceActorHeadline,intelligenceActorChange} from "@/lib/public-intelligence-actor-copy";
import { withPublicRuntimeTimeout } from "@/lib/public-runtime-timeout";
import type { StatelessIntelligenceResult } from "@/lib/stateless-public-intelligence.server";
import type { StatelessCategory, StatelessIntelligenceSignal } from "@/lib/stateless-intelligence-model";

import { loadReaderPreferences, saveReaderPreferences } from "@/lib/reader-preferences";

const DOMAINS: readonly { key: StatelessCategory; label: string }[] = [
  { key: "geopolitics", label: "Geopolitics" },
  { key: "macro", label: "Macro Economics" },
  { key: "rare_earth", label: "Critical Minerals" },
];
const displayProse = (text: string) => text.replace(/\s*\u2014\s*/gu, "; ");
const REFRESH_MS = 2 * 60_000;
// Poll the small static rolling snapshot every two minutes. Historical shards
// are loaded from the permanent static archive once per desk visit; neither path uses D1.
const JOURNAL_REFRESH_MS = 2 * 60_000;
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

const CATEGORY_STYLE = {
  geopolitics: { bar: "bg-rose-500", icon: "text-rose-500", marker: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300", reading: "GEOPOLITICAL SIGNAL" },
  macro: { bar: "bg-sky-500", icon: "text-sky-500", marker: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300", reading: "MACRO ECONOMICS SIGNAL" },
  rare_earth: { bar: "bg-amber-500", icon: "text-amber-500", marker: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300", reading: "CRITICAL MINERALS SIGNAL" },
} as const;

// LOCKED PRESENTATION CONTRACT: OSINT and official-derived findings share this exact
// Story component, category styling, layout, save action, What changed and Why it matters.
// OSINT shares the canonical presentation; the internal unverified status is not shown on the public website.
function Story({ signal, saved, onSave }: {signal: StatelessIntelligenceSignal;saved:boolean;onSave:()=>void}) {
  const look = CATEGORY_STYLE[signal.category];
  const mandatoryCredits=intelligenceRequiredSourceCredits(signal);
  return (
    <article data-testid="geomacro-concrete-intelligence-card"
      data-geomacro-story-id={signal.id}
      className="min-w-0 overflow-hidden rounded-2xl border border-border/75 bg-card shadow-sm transition-colors hover:border-border">
      <div className={look.bar + " h-1 w-full"} aria-hidden />
      <div className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-foreground/80">GEOMACRO <span className="text-muted-foreground">/ INTELLIGENCE</span></span>
          <button type="button" onClick={onSave} aria-pressed={saved} aria-label={saved ? "Remove saved finding" : "Save finding"}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
            <Bookmark className="h-3.5 w-3.5" fill={saved ? "currentColor" : "none"} aria-hidden />{saved ? "Saved" : "Save"}
          </button>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <span className={"inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider " + look.marker}>
            {signal.category === "geopolitics" ? <Globe2 className="h-3.5 w-3.5" aria-hidden /> :
              signal.category === "macro" ? <TrendingUp className="h-3.5 w-3.5" aria-hidden /> : <Gem className="h-3.5 w-3.5" aria-hidden />}
            {labelFor(signal.category)}
          </span>
        </div>
        <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{look.reading}</p>
        <h3 className="mt-2 text-xl font-semibold leading-snug tracking-tight text-foreground">{displayProse(concreteIntelligenceHeadline(signal) ?? "")}</h3>
        {signal.geography ? <p className="mt-2 text-xs text-muted-foreground">{displayProse(signal.geography)}</p> : null}
        <p className="mt-4 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">What changed</p>
        <p className="mt-1 text-sm leading-relaxed text-foreground/85">{displayProse(intelligenceActorChange(signal))}</p>
        <div className="mt-5 rounded-xl border border-border/60 bg-muted/35 p-4">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-primary">GEOMACRO ANALYSIS / Why it matters</p>
          <p className="mt-2 text-sm leading-6 text-foreground/85">{displayProse(concreteGeomacroAnalysis(signal))}</p>
        </div>
        <time className="mt-4 block text-[11px] text-muted-foreground" dateTime={signal.published_at}>{formatInstant(signal.published_at)}</time>
        {mandatoryCredits.length > 0 ? (
          <div className="mt-2 text-[11px] leading-5 text-muted-foreground" aria-label="Required source attribution">
            {mandatoryCredits.map((credit, index) => <p key={index}>Attribution: {displayProse(credit)}</p>)}
          </div>
        ) : null}
      </div>
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
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [savedOnly, setSavedOnly] = useState(false);
  const [lastVisit, setLastVisit] = useState<number | null>(null);
  const [readerReady, setReaderReady] = useState(false);
  const visitStarted = useRef<number>(0);
  useEffect(() => {
    visitStarted.current = Date.now();
    try {
      const reader = loadReaderPreferences();
      if (initialView === "all") setView(reader.category);
      setSavedIds(reader.savedIds);
      setLastVisit(reader.lastVisit);
    } catch { /* Browser storage is optional. */ }
    setReaderReady(true);
  }, []);
  useEffect(() => {
    if (initialView !== "all") setView(initialView);
  }, [initialView]);
  useEffect(() => {
    if (!readerReady) return;
    try { saveReaderPreferences({ category: view, savedIds, lastVisit: visitStarted.current }); }
    catch { /* Private browsing and storage limits must not block reading. */ }
  }, [view, savedIds, readerReady]);
  const toggleSaved = (id: string) => setSavedIds(ids => ids.includes(id) ? ids.filter(value => value !== id) : [id, ...ids].slice(0, 200));
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

  // Historical findings come from the append-only static archive. The rolling
  // static snapshot adds new findings between archive publications. No website
  // read has a D1 or server-function fallback.
  useEffect(() => {
    let alive = true;
    let pending = false;
    let archiveLoaded = false;
    const sortSignals = (signals: StatelessIntelligenceSignal[]) =>
      signals.sort((a, b) =>
        b.published_at.localeCompare(a.published_at) || a.id.localeCompare(b.id));
    const mergeArchive = (
      previous: StatelessIntelligenceSignal[],
      archived: StatelessIntelligenceSignal[],
    ): StatelessIntelligenceSignal[] => {
      const merged = new Map(previous.map(signal => [signal.id, signal]));
      // The immutable archive wins when SSR's rolling snapshot repeats an ID.
      for (const signal of archived) merged.set(signal.id, signal);
      return sortSignals([...merged.values()]);
    };
    const mergeUnseen = (
      previous: StatelessIntelligenceSignal[],
      incoming: StatelessIntelligenceSignal[],
    ): StatelessIntelligenceSignal[] => {
      const seen = new Set(previous.map(signal => signal.id));
      const additions = incoming.filter(signal => !seen.has(signal.id));
      if (additions.length === 0) return previous;
      return sortSignals([...previous, ...additions]);
    };
    const sync = async () => {
      if (pending) return;
      pending = true;
      try {
        if (!archiveLoaded) {
          try {
            const historical = await fetchPermanentDerivedNews();
            if (!alive) return;
            setJournal(previous => mergeArchive(previous, historical));
            archiveLoaded = true;
            setJournalUnavailable(false);
          } catch {
            if (alive) setJournalUnavailable(true);
          }
        }
        try {
          const recent = await fetchDirectDerivedNews();
          if (!alive) return;
          setJournal(previous => mergeUnseen(previous, recent));
          if (archiveLoaded) setJournalUnavailable(false);
        } catch {
          if (alive) setJournalUnavailable(true);
        }
      } finally {
        pending = false;
      }
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
  const merged = new Map<string, StatelessIntelligenceSignal>();
  for (const signal of journal) merged.set(signal.id, signal);
  for (const domain of known) {
    for (const signal of feeds[domain.key]?.signals ?? []) merged.set(signal.id, signal);
  }
  const checkedAt = Date.now();
  const allSignals = filterIntelligenceDesk(dedupeIntelligenceStories([...merged.values()].filter(isConcretePublicIntelligence)), {category:"all",query:"",period:"all"}, checkedAt);
  const categorySignals = allSignals.filter(signal => signal.category === view);
  const signals = filterIntelligenceDesk(allSignals, {category:view,query,period}, checkedAt).filter(signal => !savedOnly || savedIds.includes(signal.id));
  const newSinceVisit = lastVisit === null ? null : categorySignals.filter(signal => Date.parse(signal.published_at) > lastVisit).length;
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
          Your briefing on Geopolitics, Macro Economics and Critical Minerals.
        </p>
        <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Clock3 className="h-4 w-4" aria-hidden />
          <span>No added publication delay · Original dates shown</span>
        </p>
      </header>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card/30 px-4 py-3">
        <p role="status" className="text-xs text-muted-foreground">{newSinceVisit === null ? "Make this your daily briefing." : `${newSinceVisit} available findings published since your previous visit in this category.`}</p>
        <button type="button" aria-pressed={savedOnly} onClick={() => { setSavedOnly(value => !value); setVisibleCount(INTELLIGENCE_PAGE_SIZE); }} className="inline-flex min-h-10 items-center gap-2 text-sm text-primary"><Bookmark className="h-4 w-4" />{savedOnly ? "Show all findings" : `Saved findings (${savedIds.length})`}</button>
        <p className="w-full text-[11px] text-muted-foreground">Preferences and saved IDs stay in this browser. Saved findings remain readable while available in the feed.</p>
      </div>
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

      {view === "macro" && <MacroFastlanePanel />}
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
                ? "Checking for concrete news developments"
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

        {journalUnavailable ? (
          <p role="status" className="mt-4 text-xs text-muted-foreground">
            The complete journal is temporarily unreachable; fallback findings may be incomplete. Original-source checks remain active;
            no old finding is relabeled as newly published.
          </p>
        ) : null}
        {signals.length > 0 ? (
          <div className="mt-6 space-y-8" aria-live="polite" aria-atomic="false">
            {recent.length > 0 ? (
              <section><h3 className="mb-3 text-sm font-semibold">New in the last 24 hours</h3><div className="grid items-start gap-4 lg:grid-cols-2">{recent.map(signal => <Story key={signal.id} signal={signal} saved={savedIds.includes(signal.id)} onSave={() => toggleSaved(signal.id)} />)}</div></section>
            ) : (
              <p className="text-sm text-muted-foreground">
                No eligible concrete news in this view during the last 24 hours.
              </p>
            )}
            {earlier.length > 0 ? (
              <section><h3 className="mb-3 text-sm font-semibold">Earlier news · Dated</h3><div className="grid items-start gap-4 lg:grid-cols-2">{earlier.map(signal => <Story key={signal.id} signal={signal} saved={savedIds.includes(signal.id)} onSave={() => toggleSaved(signal.id)} />)}</div></section>
            ) : null}
          </div>
        ) : missing.length === 0 ? (
          <p role="status" className="mt-6 rounded-xl border border-dashed border-border px-5 py-6 text-sm text-muted-foreground">
            No eligible concrete news matches this category, search and publication window.
            News that cannot establish an actor and action is not displayed.
          </p>
        ) : null}

        {signals.length > 0 ? <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
          <p role="status" className="text-xs text-muted-foreground">Showing {shown.length} of {signals.length} matching findings</p>
          {shown.length < signals.length ? <button type="button" onClick={()=>setVisibleCount(count=>count+INTELLIGENCE_PAGE_SIZE)} className="min-h-11 rounded-xl border border-border px-5 text-sm font-medium hover:bg-muted">Show more findings</button> : null}
        </div> : null}

      </section>
    </main>
  );
}
