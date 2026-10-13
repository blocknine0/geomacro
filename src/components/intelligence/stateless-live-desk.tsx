import { useEffect, useRef, useState } from "react";
import { AlertCircle, Clock3, RefreshCw } from "lucide-react";
import { getStatelessIntelligence } from "@/lib/stateless-intelligence.functions";
import { getWebsiteDerivedNews } from "@/lib/website-derived-news.functions";
import { fetchDirectDerivedNews } from "@/lib/public-derived-news-client";
import { withPublicRuntimeTimeout } from "@/lib/public-runtime-timeout";
import type { StatelessIntelligenceResult } from "@/lib/stateless-public-intelligence.server";
import type { StatelessCategory, StatelessIntelligenceSignal } from "@/lib/stateless-intelligence-model";

const DOMAINS: readonly { key: StatelessCategory; label: string }[] = [
  { key: "geopolitics", label: "Geopolitics" },
  { key: "macro", label: "Macro / FX" },
  { key: "rare_earth", label: "Critical Minerals" },
];
const REFRESH_MS = 2 * 60_000;
const OGL_URL = "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/";
type FeedState = Partial<Record<StatelessCategory, StatelessIntelligenceResult>>;
type View = StatelessCategory | "all";

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

function Story({ signal, checkedAt }: {
  signal: StatelessIntelligenceSignal;
  checkedAt: number;
}) {
  const isCurrent = Date.parse(signal.published_at) >= checkedAt - 86_400_000;
  return (
    <article className="rounded-2xl border border-border/80 bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-primary">
          GEOMACRO FINDS
        </span>
        <span aria-hidden>·</span>
        <span>{labelFor(signal.category)}</span>
        <span aria-hidden>·</span>
        <time dateTime={signal.published_at}>{formatInstant(signal.published_at)}</time>
        {!isCurrent ? <span>· Earlier original release</span> : null}
      </div>
      <h3 className="mt-3 text-lg font-semibold leading-snug sm:text-xl">{signal.title}</h3>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-primary">What changed</h4>
          <p className="mt-1 text-sm leading-6">{signal.what_changed}</p>
        </div>
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-primary">Why it matters</h4>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{signal.why_it_matters}</p>
        </div>
      </div>
      {signal.sources_credited.length > 0 ? (
        <div className="mt-4 border-t border-border/60 pt-3 text-xs text-muted-foreground">
          {signal.sources_credited.map(credit => (
            <p key={credit}>Required credit: {credit}
              {credit.includes("Open Government Licence") ? (
                <> · <a href={OGL_URL} target="_blank" rel="noopener noreferrer"
                  className="underline underline-offset-2">Licence</a></>
              ) : null}
            </p>
          ))}
        </div>
      ) : null}
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
export function StatelessLiveDesk({ initial, initialFeeds = {}, initialJournal = [] }: {
  initial: StatelessIntelligenceResult | null;
  initialFeeds?: FeedState;
  initialJournal?: StatelessIntelligenceSignal[];
}) {
  const [view, setView] = useState<View>("all");
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

  // Durable derived-only 30-day D1 journal independent of visitor activity.
  useEffect(() => {
    let alive = true;
    const sync = async () => {
      // Browser-direct D1 is crucial when a Lovable server-function roundtrip
      // fails despite the verified, public, source-private D1 journal.
      try {
        const signals = await fetchDirectDerivedNews();
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
          if (alive) { setJournal(result.signals); setJournalUnavailable(false); }
        } catch { if (alive) setJournalUnavailable(true); }
      }
    };
    void sync();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void sync();
    }, REFRESH_MS);
    const onReturn = () => { if (document.visibilityState === "visible") void sync(); };
    document.addEventListener("visibilitychange", onReturn);
    return () => {
      alive = false;
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
  const allSignals = [...merged.values()]
    .sort((a, b) => b.published_at.localeCompare(a.published_at) || a.id.localeCompare(b.id));
  const signals = allSignals.filter(signal => view === "all" || signal.category === view);
  const checkedAt = Date.now();
  const recent = signals.filter(signal => Date.parse(signal.published_at) >= checkedAt - 86_400_000);
  const earlier = signals.filter(signal => Date.parse(signal.published_at) < checkedAt - 86_400_000);
  const active = view === "all" ? DOMAINS : DOMAINS.filter(domain => domain.key === view);
  const incomplete = active.filter(domain => errors[domain.key] || feeds[domain.key]?.healthy_feed_count === 0);
  const latestCheck = Math.max(0, ...active.map(domain =>
    Date.parse(feeds[domain.key]?.checked_at ?? "") || 0));
  const missing = active.filter(domain => !feeds[domain.key]);
  const refreshOnClick = () => manualRefresh.current();

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
          A continuously updating feed of Geomacro-derived news across Geopolitics, Macro/FX and
          Critical Minerals. An original-publisher release appears only after the 15-minute
          website delay. The rolling 30-day derived-only timeline keeps prior findings visible
          even when a publisher's feed rotates or every visitor closes the website. No risk scores.
        </p>
        <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Clock3 className="h-4 w-4" aria-hidden />
          <span>15-minute delayed · Background collection every 30 minutes · Live refresh every 2 minutes while open</span>
        </p>
      </header>

      <section className="mt-8" aria-label="Intelligence category">
        <h2 className="text-sm font-semibold">Browse current developments</h2>
        <div role="group" aria-label="Intelligence category"
          className="mt-3 flex flex-wrap gap-2">
          <button type="button" aria-pressed={view === "all"} onClick={() => setView("all")}
            className={"min-h-11 rounded-xl border px-4 py-2 text-sm font-semibold " +
              (view === "all" ? "border-primary bg-primary text-primary-foreground" :
                "border-border bg-card hover:border-primary/60")}>All latest</button>
          {DOMAINS.map(domain => (
            <button key={domain.key} type="button" aria-pressed={view === domain.key}
              onClick={() => setView(domain.key)}
              className={"min-h-11 rounded-xl border px-4 py-2 text-sm font-semibold " +
                (view === domain.key ? "border-primary bg-primary text-primary-foreground" :
                  "border-border bg-card hover:border-primary/60")}>
              {domain.label}
              <span className="ml-2 text-xs opacity-80">{allSignals.length === 0 ? "…" :
                allSignals.filter(signal => signal.category === domain.key).length}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="mt-8" aria-labelledby="stateless-updates-heading">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">
              Latest Geomacro finds
            </p>
            <h2 id="stateless-updates-heading" className="mt-1 text-2xl font-semibold">
              {view === "all" ? "Across all three domains" : labelFor(view) + " developments"}
            </h2>
            <p role="status" className="mt-2 text-xs text-muted-foreground">
              {allSignals.length === 0
                ? "Reading the verified 30-day Intelligence journal below"
                : recent.length + " in the last 24 hours · " +
                  earlier.length + " earlier (last 30 days)"}
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

        {allSignals.length === 0 ? (
          <section aria-label="Direct verified Intelligence archive" className="mt-6">
            <p className="mb-3 text-xs text-muted-foreground">
              Reading the verified rolling Intelligence history directly from our Cloudflare feed
              while the website service restores its connection.
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
                Open the directly verified news feed
              </a>
            </p>
          </section>
        ) : null}
        {journalUnavailable ? (
          <p role="status" className="mt-4 text-xs text-muted-foreground">
            Rolling history is temporarily unreachable from both D1 delivery paths. Direct official source checks remain active;
            no old finding is relabeled as newly published.
          </p>
        ) : null}
        {signals.length > 0 ? (
          <div className="mt-6 space-y-8" aria-live="polite" aria-atomic="false">
            {recent.length > 0 ? (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold">New in the last 24 hours</h3>
                {recent.map(signal => <Story key={signal.id} signal={signal} checkedAt={checkedAt} />)}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No verified original release from this view in the last 24 hours.
              </p>
            )}
            {earlier.length > 0 ? (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold">Earlier original releases · Last 30 days</h3>
                {earlier.map(signal => <Story key={signal.id} signal={signal} checkedAt={checkedAt} />)}
              </div>
            ) : null}
          </div>
        ) : missing.length === 0 ? (
          <p role="status" className="mt-6 rounded-xl border border-dashed border-border px-5 py-6 text-sm text-muted-foreground">
            No eligible original-dated findings in this source window.
            Source availability does not prove the absence of real-world events.
          </p>
        ) : null}

        <p className="mt-8 text-xs leading-6 text-muted-foreground">
          Only Geomacro-derived findings are kept in a bounded Cloudflare D1 30-day timeline.
          Raw upstream feeds, publisher article text, original headlines and source URLs are not stored.
          Live original-source reads remain independent of Supabase and historical risk score archives.
          Original publication timestamps, not fetch or restore times, control the 15-minute delay.
          A publisher release is not an independently verified market outcome.
        </p>
      </section>
    </main>
  );
}
