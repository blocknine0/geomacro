import { RiskScore, RiskTrend } from "@/components/foundation/risk";
import { RiskChart } from "@/components/home/risk-chart";
import { ChartSkeleton, InlineError, EmptyState } from "@/components/foundation/async-states";
import { LastUpdated } from "@/components/foundation/live";
import { EventIntelRow } from "@/components/intelligence/card";
import { prettyCategory, type Intelligence } from "@/lib/use-intelligence";
import { GRI_METHODOLOGY } from "@/lib/use-global-risk";
import { GriProofDialog } from "@/components/gri/gri-proof-dialog";
import type { GlobalRisk, RiskStatus } from "@/lib/use-global-risk";
import type { UserError } from "@/lib/user-errors";

function Panel({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[var(--radius-card)] border border-border/70 bg-card/40 p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="type-meta text-muted-foreground">{title}</h2>
        {aside}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/**
 * Restrained desktop context rail. Global Risk reuses the existing
 * useGlobalRisk model — no second calculation of the index.
 */
export function IntelSidebar({
  risk,
  riskStatus,
  riskError,
  riskUpdatedAt,
  retryRisk,
  intel,
}: {
  risk: GlobalRisk | null;
  riskStatus: RiskStatus;
  riskError: UserError | null;
  riskUpdatedAt: number | null;
  retryRisk: () => void;
  intel: Intelligence | null;
}) {
  const series = risk?.series["24H"] ?? risk?.series["7D"];
  const delta = risk && risk.previous !== null ? risk.score - risk.previous : null;

  return (
    <div className="flex flex-col gap-4 lg:sticky lg:top-24">
      <Panel title="Global risk" aside={<LastUpdated at={riskUpdatedAt} />}>
        {riskStatus === "loading" && !risk ? (
          <ChartSkeleton height={90} />
        ) : !risk ? (
          <InlineError error={riskError ?? "Risk index unavailable."} onRetry={retryRisk} />
        ) : (
          <>
            <div className="flex flex-wrap items-baseline gap-3">
              <RiskScore score={risk.score} size="md" />
              {delta !== null && <RiskTrend delta={delta} unit=" pts" />}
            </div>
            {series?.buckets ? (
              <RiskChart
                buckets={series.buckets}
                label={`Global risk, ${series.timeframe}`}
                height={90}
                className="mt-3"
              />
            ) : (
              <p className="type-meta mt-3 text-muted-foreground">
                Not enough readings to draw a trend line yet.
              </p>
            )}
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              {GRI_METHODOLOGY.definition} {GRI_METHODOLOGY.notProbability}
            </p>
            <div className="mt-3">
              <GriProofDialog risk={risk} />
            </div>
          </>
        )}
      </Panel>

      <Panel title="Top categories">
        {!intel || intel.categoryCounts.length === 0 ? (
          <p className="type-meta text-muted-foreground">No categorised events in this window.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {intel.categoryCounts.slice(0, 6).map((c) => (
              <li key={c.category} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate text-foreground">
                  {prettyCategory(c.category)}
                </span>
                <span className="type-meta shrink-0 text-muted-foreground">
                  {c.count} · avg {c.avgSeverity}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Latest updates">
        {!intel || intel.latest.length === 0 ? (
          <EmptyState
            title="Nothing new yet"
            description="Updates appear as the pipeline classifies events."
            className="border-0 bg-transparent px-0 py-3"
          />
        ) : (
          <div className="-mx-2 flex flex-col">
            {intel.latest.map((e) => (
              <EventIntelRow key={e.id} event={e} />
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
