import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { HomeSection } from "@/components/home/section";
import { RiskChart } from "@/components/home/risk-chart";
import { RiskBadge, RiskTrend, riskLevel } from "@/components/foundation/risk";
import { EmptyValue } from "@/components/foundation/data";
import { LastUpdated } from "@/components/foundation/live";
import { ChartSkeleton, EmptyState, ErrorState, UpdatingIndicator } from "@/components/foundation/async-states";
import { GRI_METHODOLOGY } from "@/lib/use-global-risk";
import type { GlobalRisk, RiskStatus, Timeframe } from "@/lib/use-global-risk";
import type { UserError } from "@/lib/user-errors";
import { cn } from "@/lib/utils";
import { GriProofDialog } from "@/components/gri/gri-proof-dialog";

const TIMEFRAMES: Timeframe[] = ["24H", "7D", "30D"];
const INTELLIGENCE_FLOW = [
  "Real-world evidence",
  "Structured signals",
  "Global Risk Index",
  "Change attribution",
  "Evidence & confidence",
] as const;

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
      eyebrow="Primary intelligence"
      title="Global Risk Index"
      subtitle="A continuously updated, versioned view of geopolitical, macro and critical-mineral risk, backed by structured evidence, confidence and historical context."
      aside={
        <div className="flex items-center gap-3">
          {status === "updating" && <UpdatingIndicator />}
          <LastUpdated at={updatedAt} />
        </div>
      }
    >
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm text-muted-foreground">
        {INTELLIGENCE_FLOW.map((step, index) => (
          <li key={step} className="flex items-center gap-2">
            <span className={index === 2 ? "font-medium text-foreground" : ""}>{step}</span>
            {index < INTELLIGENCE_FLOW.length - 1 && <span aria-hidden>→</span>}
          </li>
        ))}
      </ol>
      <p className="mt-3 text-sm font-medium text-foreground">Not just the score. Geomacro shows what changed and why.</p>

      {status === "loading" && !risk ? (
        <div className="mt-6 rounded-2xl border border-border/70 bg-card/50 p-6">
          <div className="h-12 w-40 animate-pulse rounded bg-muted/60" />
          <ChartSkeleton height={220} className="mt-6" />
        </div>
      ) : !risk ? (
        <div className="mt-6">
          <ErrorState title="Risk index unavailable" error={error ?? "Risk index unavailable."} onRetry={retry} />
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-2xl border border-border/70 bg-card/50">
          <div className="grid gap-8 p-5 sm:p-6 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Current verified reading</p>
                <span className="font-mono text-[10px] text-muted-foreground">{risk.methodologyVersion}</span>
              </div>

              <div className="mt-3 flex flex-wrap items-end gap-3">
                <span className="type-metric text-5xl text-foreground sm:text-6xl">
                  {risk.score}<span className="ml-1 text-base text-muted-foreground">/100</span>
                </span>
                {delta !== null && <RiskTrend delta={delta} />}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <RiskBadge score={risk.score} />
                <span className="text-sm text-muted-foreground">
                  {riskLevel(risk.score).description ?? `Global risk is ${riskLevel(risk.score).label.toLowerCase()}.`}
                </span>
              </div>

              <dl className="mt-6 grid grid-cols-2 gap-x-5 gap-y-4">
                <Readout label="Previous" value={risk.previous} />
                <Readout label="Evidence articles" value={risk.eventCount} />
                <Readout label="Independent stories" value={risk.independentStoryCount} />
                <Readout label="Sources" value={risk.sourceCount} />
                <Readout label="Evidence coverage %" value={Math.round(risk.coverage * 100)} />
                <Readout label="Weighted confidence %" value={risk.weightedConfidence === null ? null : Math.round(risk.weightedConfidence)} />
              </dl>

              <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
                {GRI_METHODOLOGY.definition} {GRI_METHODOLOGY.notProbability}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <span className="font-mono text-[10px] text-muted-foreground">
                  {risk.verificationStatus === "verified" ? "Verified immutable snapshot" : "Published snapshot"}
                </span>
                <GriProofDialog risk={risk} />
              </div>
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Verified history</p>
                <div role="tablist" aria-label="Risk index timeframe" className="flex gap-1 rounded-lg border border-border/70 p-1">
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
                          "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                          selected ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
                          !available && "opacity-60",
                        )}
                      >
                        {tf}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-4">
                {series?.buckets ? (
                  <RiskChart buckets={series.buckets} label={`Global Risk Index, ${timeframe}`} height={240} />
                ) : (
                  <EmptyState
                    title={`Verified ${timeframe} history is still building`}
                    description="The chart appears only when enough comparable published snapshots exist."
                  />
                )}
              </div>
            </div>
          </div>

          <div className="border-t border-border/60">
            <button
              type="button"
              onClick={() => setWhyOpen((value) => !value)}
              aria-expanded={whyOpen}
              aria-controls="why-risk-moving"
              className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-muted/30 sm:px-6"
            >
              <span>
                <span className="block font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Change attribution</span>
                <span className="mt-1 block text-sm font-medium text-foreground">Why is risk moving?</span>
              </span>
              <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", whyOpen && "rotate-180")} aria-hidden />
            </button>

            {whyOpen && (
              <div id="why-risk-moving" className="border-t border-border/60 px-5 py-5 sm:px-6">
                {risk.drivers.length === 0 ? (
                  <EmptyState
                    title="Driver-level attribution is not available yet"
                    description="Attribution appears only when the published snapshot carries comparable category contribution data."
                  />
                ) : (
                  <div className="grid gap-6 lg:grid-cols-[1fr_0.8fr]">
                    <ul className="space-y-3">
                      {risk.drivers.map((driver) => (
                        <li key={driver.category} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center justify-between gap-3">
                              <p className="truncate text-sm font-medium capitalize text-foreground">{prettyDomain(driver.category)}</p>
                              <span className="type-metric text-sm">{driver.score}</span>
                            </div>
                            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
                              <div className="h-full rounded-full bg-primary/70" style={{ width: `${Math.max(2, Math.round(driver.contribution * 100))}%` }} />
                            </div>
                          </div>
                          <div className="w-16 text-right">
                            {driver.change !== null ? <RiskTrend delta={driver.change} /> : <span className="text-xs text-muted-foreground">No prior</span>}
                          </div>
                        </li>
                      ))}
                    </ul>

                    <div className="rounded-xl border border-border/60 bg-background/30 p-4">
                      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Top driver</p>
                      {risk.topDriver?.topEvent ? (
                        <>
                          <p className="mt-3 text-sm font-medium leading-relaxed text-foreground">{risk.topDriver.topEvent.title}</p>
                          {risk.topDriver.topEvent.summary && (
                            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{risk.topDriver.topEvent.summary}</p>
                          )}
                          <p className="mt-3 text-xs text-muted-foreground">
                            {prettyDomain(risk.topDriver.category)}
                            {typeof risk.topDriver.topEvent.severity === "number" ? ` · Severity ${risk.topDriver.topEvent.severity}` : ""}
                          </p>
                        </>
                      ) : (
                        <p className="mt-2 text-sm text-muted-foreground">No top-driver event is available for this snapshot.</p>
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
      <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{label}</dt>
      <dd className="type-metric mt-1 text-lg text-foreground">
        {typeof value === "number" ? value : <EmptyValue />}
      </dd>
    </div>
  );
}

function prettyDomain(value: string) {
  if (value === "rare_earth") return "Critical minerals";
  return value.replace(/_/g, " ");
}
