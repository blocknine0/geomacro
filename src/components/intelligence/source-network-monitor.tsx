import { useEffect, useState } from "react";
import {
  PUBLIC_SOURCE_COVERAGE_DOMAINS,
  type CommercialIntelligenceCategory,
} from "@/lib/public-intelligence-source-coverage";

type SourcePulseState = {
  label: string;
  lastChecked: string | null;
  topicCount: number | null;
};
const EMPTY: SourcePulseState = {
  label: "Latest original-publisher check unavailable",
  lastChecked: null,
  topicCount: null,
};
const MAX_AGE_MS = 90 * 60_000;
const MAX_SKEW_MS = 5 * 60_000;
const POLL_MS = 5 * 60_000;

/**
 * This is source-monitoring telemetry, NOT the verified news/story feed.
 * Never promote source registration counts or original-publisher topic counts
 * to risk events, payment availability, scores or independent corroboration.
 */
export function classifySourcePulse(
  payload: unknown,
  category: CommercialIntelligenceCategory,
  now = Date.now(),
): SourcePulseState {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return EMPTY;
  const data = payload as Record<string, unknown>;
  if (data.category !== category) return EMPTY;
  const record = data.original_publisher_observation;
  if (!record || typeof record !== "object" || Array.isArray(record)) return EMPTY;
  const proof = record as Record<string, unknown>;
  if (proof.schema !== "geomacro.category-original-source-pulse-30m.v1" ||
      proof.target_poll_minutes !== 30 ||
      proof.observational_only !== true ||
      proof.current_signed_risk_intelligence_verified !== false ||
      proof.paid_availability_proven !== false) return EMPTY;
  const row = proof.observation;
  if (!row || typeof row !== "object" || Array.isArray(row)) return EMPTY;
  const obs = row as Record<string, unknown>;
  const checkedAt = typeof obs.checked_at === "string" ? obs.checked_at : null;
  const timestamp = checkedAt ? Date.parse(checkedAt) : NaN;
  if (!Number.isFinite(now) || !Number.isFinite(timestamp) ||
      timestamp > now + MAX_SKEW_MS || timestamp < now - MAX_AGE_MS) {
    return { label: "Publisher monitoring delayed or stale", lastChecked: checkedAt, topicCount: null };
  }
  if (obs.status === "SOURCE_TRANSPORT_DEGRADED") {
    return { label: "Publisher check degraded", lastChecked: checkedAt, topicCount: null };
  }
  if (obs.status !== "SOURCE_NATIVE_OBSERVED") return {
    label: "Publisher monitoring not yet verified",
    lastChecked: checkedAt,
    topicCount: null,
  };
  const count = obs.publisher_topic_items_in_last_30m;
  if (!Number.isSafeInteger(count) || typeof count !== "number" || count < 0 || count > 1000) return EMPTY;
  return {
    label: count === 0
      ? "No relevant item in the sampled publisher's last 30 minutes"
      : "Relevant dated publisher items observed · not scored",
    lastChecked: checkedAt,
    topicCount: count,
  };
}
const initialStatus = Object.fromEntries(
  PUBLIC_SOURCE_COVERAGE_DOMAINS.map(row => [row.category, EMPTY]),
) as Record<CommercialIntelligenceCategory, SourcePulseState>;

export function SourceNetworkMonitor() {
  const [statuses, setStatuses] = useState(initialStatus);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const results = await Promise.all(PUBLIC_SOURCE_COVERAGE_DOMAINS.map(async row => {
        try {
          // No POST, x402 payment, provider API credential or unverified source
          // fetch: this is the existing three-category discovery GET.
          const response = await fetch(row.intelligence_query_path, {
            method: "GET",
            cache: "no-store",
            credentials: "same-origin",
            headers: { Accept: "application/json" },
            signal: AbortSignal.timeout(3500),
          });
          if (!response.ok) return [row.category, EMPTY] as const;
          const data: unknown = await response.json();
          return [row.category, classifySourcePulse(data, row.category)] as const;
        } catch {
          return [row.category, EMPTY] as const;
        }
      }));
      if (active) setStatuses(Object.fromEntries(results) as typeof initialStatus);
    };
    void refresh();
    const timer = setInterval(() => { void refresh(); }, POLL_MS);
    return () => { active = false; clearInterval(timer); };
  }, []);

  return (
    <section className="mt-8 rounded-2xl border border-border/70 bg-card/40 p-4 sm:p-5"
      aria-labelledby="source-intake-coverage-heading">
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Source network · discovery only</p>
      <h2 id="source-intake-coverage-heading" className="mt-1 text-xl font-semibold">
        Three-domain monitoring coverage
      </h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Catalogued monitoring entries, not unique news stories or approved publishers.
        Actual intelligence appears in the verified news desk only after its separate
        evidence, publication-time and scoring checks succeed.
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {PUBLIC_SOURCE_COVERAGE_DOMAINS.map(row => {
          const live = statuses[row.category];
          return (
            <article key={row.category} className="rounded-xl border border-border/70 bg-background/30 p-4">
              <p className="text-sm font-semibold">{row.label}</p>
              <p className="mt-1 font-mono text-2xl font-semibold tabular-nums">{row.catalogued_entries}</p>
              <p className="mt-1 text-xs text-muted-foreground">Registered source-lane entries · historical snapshot</p>
              <p className="mt-3 text-xs leading-5 text-muted-foreground" role="status">
                {live.label}
                {live.topicCount !== null && live.topicCount > 0 ? ` · ${live.topicCount} item(s)` : ""}
              </p>
              {live.lastChecked ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Last publisher check: <time dateTime={live.lastChecked}>
                    {new Date(live.lastChecked).toLocaleString("en-GB", {timeZone:"UTC"})} UTC
                  </time>
                </p>
              ) : null}
            </article>
          );
        })}
      </div>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">
        Source inventory last verified{" "}
        <time dateTime={PUBLIC_SOURCE_COVERAGE_DOMAINS[0].catalogued_as_of}>
          {new Date(PUBLIC_SOURCE_COVERAGE_DOMAINS[0].catalogued_as_of).toLocaleString("en-GB", {timeZone:"UTC"})} UTC
        </time>
        . Private Telegram/historical registry refresh is not verified; some entries
        overlap across catalogs. Best-effort original-publisher checks target every
        30 minutes, but source transport or GitHub scheduling may be delayed.
        <a href={PUBLIC_SOURCE_COVERAGE_DOMAINS[0].evidence_receipt_url}
          target="_blank" rel="noreferrer" className="ml-1 text-primary underline underline-offset-2">
          Inspect intake evidence
        </a>
      </p>
    </section>
  );
}
