import { useEffect, useRef, useState } from "react";
import { Clock3, RefreshCw, AlertCircle } from "lucide-react";
import { getStatelessIntelligence } from "@/lib/stateless-intelligence.functions";
import type { StatelessIntelligenceResult } from "@/lib/stateless-public-intelligence.server";
import type { StatelessCategory } from "@/lib/stateless-intelligence-model";

const DOMAINS = [
  { key: "geopolitics", label: "Geopolitics" },
  { key: "macro", label: "Macro/FX" },
  { key: "rare_earth", label: "Critical Minerals" },
] as const;

const OGL_URL = "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/";
const REFRESH_MS = 2 * 60_000;

export function StatelessLiveDesk({ initial }: { initial: StatelessIntelligenceResult | null }) {
  const [category, setCategory] = useState<StatelessCategory>("geopolitics");
  const [data, setData] = useState<StatelessIntelligenceResult | null>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const hydrationConsumed = useRef(false);
  const current = data?.category === category ? data : null;
  const domain = DOMAINS.find(item => item.key === category)!;

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      setBusy(true);
      try {
        const result = await getStatelessIntelligence({ data: { category } });
        if (active) { setData(result); setError(false); }
      } catch {
        if (active) { setData(null); setError(true); }
      } finally {
        if (active) setBusy(false);
      }
    };
    // SSR already fetched the same category; hydrate without the duplicate read.
    if (!hydrationConsumed.current && initial && category === "geopolitics" && retryKey === 0) {
      hydrationConsumed.current = true;
    } else { void refresh(); }
    const timer = window.setInterval(() => { void refresh(); }, REFRESH_MS);
    return () => { active = false; window.clearInterval(timer); };
  }, [category, retryKey, initial]);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 md:py-12">
      <header className="max-w-4xl">
        <div className="inline-flex rounded-full border border-primary/30 px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-primary">
          Geomacro finds · 15-minute delayed
        </div>
        <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl">What changed in the world</h1>
        <p className="mt-4 text-base leading-7 text-muted-foreground">
          Geomacro finds geopolitical, Macro/FX and critical-minerals developments from original
          official releases. Read what changed and why it may matter in two short sections.
          Each distinct release appears after 15 minutes. No score, repeated article or stored feed.
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          <Clock3 className="mr-1 inline-block h-4 w-4" aria-hidden /> 15-minute delayed · Refreshed every 2 minutes while open.
          Original source dates are preserved. Findings are independent derived summaries, not confirmed market effects.
        </p>
      </header>

      <section className="mt-8" aria-label="Intelligence category">
        <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.16em] text-primary">
          Choose an intelligence category
        </p>
        <div role="group" aria-label="Intelligence category" className="grid gap-2 sm:grid-cols-3">
          {DOMAINS.map(item => (
            <button key={item.key} type="button" aria-pressed={category === item.key}
              onClick={() => setCategory(item.key)}
              className={"min-h-11 rounded-xl border px-4 py-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
                (category === item.key ? "border-primary bg-primary text-primary-foreground" :
                  "border-border bg-card hover:border-primary/60 hover:bg-muted")}>
              {item.label}
            </button>
          ))}
        </div>
      </section>

      <section className="mt-8" aria-labelledby="stateless-updates-heading">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">
              Latest Geomacro finds
            </p>
            <h2 id="stateless-updates-heading" className="mt-1 text-2xl font-semibold">
              {domain.label} developments
            </h2>
          </div>
          <button type="button" onClick={() => setRetryKey(v => v + 1)}
            disabled={busy}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium hover:bg-muted disabled:opacity-50">
            <RefreshCw className={"h-4 w-4 " + (busy ? "animate-spin" : "")} aria-hidden />
            Refresh
          </button>
        </div>
        {current ? (
          <div className="mt-3 space-y-1 text-xs text-muted-foreground" role="status">
            <p>{current.signals.length} distinct findings · {current.current_24h_count} in the last 24 hours ·
              Checked {formatInstant(current.checked_at)}</p>
            <p>{current.healthy_feed_count}/{current.feed_count} official feeds responded ·
              Original publication must predate {formatInstant(current.website_release_cutoff)}</p>
            {current.healthy_feed_count < current.feed_count ? (
              <p className="flex items-center gap-1.5">
                <AlertCircle className="h-3 w-3" aria-hidden /> Some sources are temporarily unavailable; coverage may be incomplete.
              </p>
            ) : null}
          </div>
        ) : null}
        {error ? <p role="alert" className="mt-3 rounded-lg border border-border p-3 text-sm text-muted-foreground">
          Current on-demand checks could not complete. No substitute or synthetic developments are displayed.
        </p> : null}

        {!current ? (
          <div role="status" className="mt-5 rounded-2xl border border-border p-6 text-sm text-muted-foreground">
            Checking permitted original publisher releases without storing source material…
          </div>
        ) : current.signals.length === 0 ? (
          <div role="status" className="mt-5 rounded-2xl border border-dashed border-border p-6">
            <p className="font-medium">No qualifying {domain.label} findings in this source check</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {current.status === "sources_unavailable"
                ? "The selected official feeds are unavailable. This is not evidence that no world events occurred."
                : "None of the sampled original-dated relevant releases passed the 15-minute cutoff in the past 30 days. Other sources may report additional developments."}
            </p>
          </div>
        ) : (
          <div className="mt-5 space-y-3" aria-live="polite" aria-atomic="false">
            {current.current_24h_count === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
                No new qualifying releases in the last 24 hours. Earlier original releases appear below.
              </p>
            ) : null}
            {current.signals.map(signal => (
              <article key={signal.id} className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm sm:p-6">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-primary">
                    GEOMACRO FINDS
                  </span>
                  <time dateTime={signal.published_at} className="text-xs text-muted-foreground">
                    {formatInstant(signal.published_at)}
                  </time>
                  {Date.parse(signal.published_at) >= Date.parse(current.checked_at) - 86_400_000
                    ? <span className="text-xs text-muted-foreground">Last 24h</span>
                    : <span className="text-xs text-muted-foreground">Earlier (past 30 days)</span>}
                </div>
                <h3 className="mt-3 text-xl font-semibold leading-snug tracking-tight">{signal.title}</h3>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
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
                      <p key={credit}>
                        Required credit: {credit}
                        {credit.includes("Open Government Licence") ? (
                          <> · <a className="underline underline-offset-2" href={OGL_URL} target="_blank"
                            rel="noopener noreferrer">Licence</a></>
                        ) : null}
                      </p>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
        <p className="mt-6 text-xs leading-6 text-muted-foreground">
          No database, B2, D1, browser local storage, archive, or permanent publication.
          Current readings are derived in request memory and discarded.
          Original first-publication timestamps—not fetch times, website deploy times, or modified times—control the 15-minute release delay.
          This bounded free feed does not claim complete global coverage.
        </p>
      </section>
    </main>
  );
}

function formatInstant(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    const day = Date.parse(value + "T00:00:00.000Z");
    if (Number.isFinite(day)) return new Intl.DateTimeFormat("en-GB", {
      day:"numeric",month:"short",year:"numeric",timeZone:"UTC",
    }).format(day) + " · publisher provides date only";
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp)
    ? new Intl.DateTimeFormat("en-GB", {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit", timeZone: "UTC",
    }).format(timestamp) + " UTC"
    : "Original publication time unavailable";
}
