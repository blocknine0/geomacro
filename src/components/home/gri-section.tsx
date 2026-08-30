import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { HomeSection } from "@/components/home/section";
import { RiskChart } from "@/components/home/risk-chart";
import { RiskBadge, RiskTrend, riskLevel } from "@/components/foundation/risk";
import { EmptyValue } from "@/components/foundation/data";
import { LastUpdated } from "@/components/foundation/live";
import {
  ChartSkeleton,
  EmptyState,
  ErrorState,
  UpdatingIndicator,
} from "@/components/foundation/async-states";
import { GRI_METHODOLOGY } from "@/lib/use-global-risk";
import type { GlobalRisk, RiskStatus, Timeframe } from "@/lib/use-global-risk";
import type { UserError } from "@/lib/user-errors";
import { cn } from "@/lib/utils";
import { GriProofDialog } from "@/components/gri/gri-proof-dialog";

const TIMEFRAMES: Timeframe[] = ["24H", "7D", "30D"];

export function GlobalRiskIndexSection({
  risk,
  status,
  error,
  updatedAt,
  retry,
}: {
  risk: GlobalRisk | null;
  status: RiskStatus;
  error: UserError | null;
  updatedAt: number | null;
  retry: () => void;
}) {
  const [timeframe, setTimeframe] = useState<Timeframe>("24H");
  const [whyOpen, setWhyOpen] = useState(false);

  const series = risk?.series[timeframe];
  const delta = risk && risk.previous !== null ? risk.score - risk.previous : null;

  return (
    <HomeSection
      id="global-risk-index"
      eyebrow="Live index"
      title="Global Risk Index"
      subtitle="A deterministic view of global risk across geopolitics, macro, rare earths and crypto."
      aside={
        <div className="flex items-center gap-3">
          {status === "updating" && <UpdatingIndicator />}
          <LastUpdated at={updatedAt} />
        </div>
      }
    >
      {status === "loading" && !risk ? (
        <div className="rounded-[var(--radius-card)] border border-border/70 bg-card/50 p-6">
          <div className="h-12 w-40 animate-pulse rounded bg-muted/60" />
          <ChartSkeleton height={200} className="mt-6" />
        </div>
      ) : !risk ? (
        <ErrorState
          title="Risk index unavailable"
          error={error ?? "Risk index unavailable."}
          onRetry={retry}
        />
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-card)] border border-border/70 bg-card/50">
          <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] lg:gap-8">
            <div className="min-w-0">
              <p className="type-meta text-muted-foreground">Current score</p>
              <div className="mt-2 flex flex-wrap items-baseline gap-3">
                <span className="type-metric text-5xl text-foreground sm:text-6xl">
                  {risk.score}
                  <span className="ml-1 text-base text-muted-foreground">/100</span>
                </span>
                {delta !== null && <RiskTrend delta={delta} />}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <RiskBadge score={risk.score} />
                <span className="type-body text-muted-foreground">
                  {riskLevel(risk.score).description ??
                    `Global risk is ${riskLevel(risk.score).label.toLowerCase()}.`}
                </span>
              </div>

              <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-3">
                <Readout label="Previous" value={risk.previous} />
                <Readout label={`${timeframe} low`} value={series?.low ?? null} />
                <Readout label={`${timeframe} high`} value={series?.high ?? null} />
                <Readout label="Events scored" value={risk.eventCount} />
                <Readout label="Coverage %" value={Math.round(risk.coverage * 100)} />
                <Readout
                  label="Weighted confidence"
                  value={
                    risk.weightedConfidence === null ? null : Math.round(risk.weightedConfidence)
                  }
                />
              </dl>

              <p className="mt-4 type-timestamp text-muted-foreground">
                {GRI_METHODOLOGY.definition} {GRI_METHODOLOGY.notProbability}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <span className="type-timestamp text-muted-foreground">
                  {risk.verificationStatus === "verified"
                    ? `Immutable audit snapshot · ${risk.methodologyVersion}`
                    : `Published snapshot · ${risk.methodologyVersion}`}
                </span>
                <GriProofDialog risk={risk} />
              </div>
            </div>

            <div className="min-w-0">
              <div
                role="tablist"
                aria-label="Risk index timeframe"
                className="flex w-fit gap-1 rounded-[var(--radius-control)] border border-border/70 p-1"
              >
                {TIMEFRAMES.map((tf) => {
                  const available = Boolean(risk.series[tf].buckets);
                  const selected = tf === timeframe;
                  return (
                    <button
                      key={tf}
                      role="tab"
                      type="button"
                      aria-selected={selected}
                      onClick={() => setTimeframe(tf)}
                      className={cn(
                        "min-h-11 rounded-[var(--radius-control)] px-3 py-1.5 text-xs font-medium transition-colors sm:min-h-0",
                        selected
                          ? "bg-muted text-foreground"
                          : "text-muted-foreground hover:text-foreground",
                        !available && "opacity-60",
                      )}
                    >
                      {tf}
                      {!available && <span className="sr-only"> (not enough data)</span>}
                    </button>
                  );
                })}
              </div>

              <div className="mt-4">
                {series?.buckets ? (
                  <RiskChart buckets={series.buckets} label={`Global risk index, ${timeframe}`} />
                ) : (
                  <EmptyState
                    title={`${timeframe} history unavailable`}
                    description="There aren't enough recorded readings in this window yet. Try a shorter timeframe."
                  />
                )}
              </div>
            </div>
          </div>

          <div className="border-t border-border/60">
            <button
              type="button"
              onClick={() => setWhyOpen((v) => !v)}
              aria-expanded={whyOpen}
              aria-controls="why-risk-moving"
              className="tap-target flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-muted/30 sm:px-6"
            >
              <span className="type-meta text-primary">Why is risk moving?</span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                  whyOpen && "rotate-180",
                )}
                aria-hidden
              />
            </button>
            {whyOpen && (
              <div id="why-risk-moving" className="border-t border-border/60 px-5 py-5 sm:px-6">
                {risk.drivers.length === 0 ? (
                  <EmptyState
                    title="Driver-level attribution is not available yet"
                    description="Category attribution appears once scored events carry category data for this window."
                  />
                ) : (
                  <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <ul className="space-y-3">
                      {risk.drivers.map((d) => (
                        <li
                          key={d.category}
                          className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium capitalize text-foreground">
                              {d.category}
                            </p>
                            <div
                              className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted"
                              role="img"
                              aria-label={`${Math.round(d.contribution * 100)} percent normalized category weight in the GRI`}
                            >
                              <div
                                className="h-full rounded-full bg-primary/70"
                                style={{
                                  width: `${Math.max(2, Math.round(d.contribution * 100))}%`,
                                }}
                              />
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <span className="type-metric text-sm text-foreground">{d.score}</span>
                            {d.change !== null ? (
                              <RiskTrend delta={d.change} />
                            ) : (
                              <span className="type-meta text-muted-foreground">No prior</span>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>

                    <div className="rounded-[var(--radius-card)] border border-border/60 bg-background/40 p-4">
                      <p className="type-meta text-muted-foreground">Top driver</p>
                      {risk.topDriver?.topEvent ? (
                        <>
                          <p className="mt-2 text-sm font-medium text-foreground">
                            {risk.topDriver.topEvent.title}
                          </p>
                          {risk.topDriver.topEvent.summary && (
                            <p className="mt-2 type-body text-muted-foreground">
                              {risk.topDriver.topEvent.summary}
                            </p>
                          )}
                          <p className="mt-3 type-meta text-muted-foreground">
                            <span className="capitalize">{risk.topDriver.category}</span> ·{" "}
                            {typeof risk.topDriver.topEvent.severity === "number"
                              ? `Severity ${risk.topDriver.topEvent.severity}`
                              : "Severity unavailable"}
                          </p>
                        </>
                      ) : (
                        <p className="mt-2 type-body text-muted-foreground">
                          Driver-level attribution is not available yet.
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </HomeSection>
  );
}

function Readout({ label, value }: { label: string; value: number | null }) {
  return (
    <div>
      <dt className="type-meta text-muted-foreground">{label}</dt>
      <dd className="type-metric mt-1 text-lg text-foreground">
        {typeof value === "number" ? value : <EmptyValue />}
      </dd>
    </div>
  );
}
