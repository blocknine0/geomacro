import { Link } from "@tanstack/react-router";
import { HomeSection } from "@/components/home/section";
import { RiskChart } from "@/components/home/risk-chart";
import { Button } from "@/components/ui/button";
import {
  ChartSkeleton,
  ErrorState,
  SectionLoadingState,
} from "@/components/foundation/async-states";
import { EmptyValue, Metric } from "@/components/foundation/data";
import { RiskScore } from "@/components/foundation/risk";
import { LastUpdated } from "@/components/foundation/live";
import { EventIntelCard } from "@/components/intelligence/card";
import { RankedPanel, UnavailableSurface } from "@/components/intelligence/sections";
import { GRI_METHODOLOGY } from "@/lib/use-global-risk";
import { GriProofDialog } from "@/components/gri/gri-proof-dialog";
import type { GlobalRisk, RiskStatus } from "@/lib/use-global-risk";
import type { Intelligence, IntelStatus } from "@/lib/use-intelligence";
import type { UserError } from "@/lib/user-errors";

type RiskFeed = {
  data: GlobalRisk | null;
  status: RiskStatus;
  error: UserError | null;
  updatedAt: number | null;
  retry: () => void;
};

type IntelFeed = {
  data: Intelligence | null;
  status: IntelStatus;
  error: UserError | null;
  updatedAt: number | null;
  retry: () => void;
};

/**
 * Dashboard preview built entirely from the existing Phase 2/4 read models.
 * Both hooks are owned by the route, so this page adds no extra queries.
 */
export function InstitutionalWorkspace({ risk, intel }: { risk: RiskFeed; intel: IntelFeed }) {
  const series = risk.data?.series["7D"] ?? null;

  return (
    <HomeSection
      id="inst-workspace"
      eyebrow="Workspace"
      title="Today's risk surface"
      subtitle="Live readings from the same intelligence layer the rest of the product uses."
      aside={
        <Button asChild variant="outline" className="tap-target">
          <Link to="/intelligence">Open intelligence hub</Link>
        </Button>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="min-w-0 rounded-[var(--radius-card)] border border-border/70 bg-card/40 p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="type-meta text-muted-foreground">Global Risk Index</h3>
              {risk.status === "error" ? (
                <p className="mt-2 type-body text-muted-foreground">Unavailable</p>
              ) : risk.data ? (
                <RiskScore score={risk.data.score} size="md" className="mt-2" />
              ) : (
                <p className="mt-2 type-body text-muted-foreground">Loading…</p>
              )}
            </div>
            <LastUpdated at={risk.updatedAt} live={risk.status === "ready"} />
          </div>

          <div className="mt-4">
            {risk.status === "error" ? (
              <ErrorState error={risk.error ?? undefined} onRetry={risk.retry} />
            ) : !series || !series.buckets ? (
              <ChartSkeleton height={160} />
            ) : (
              <RiskChart buckets={series.buckets} label="Global risk, last 7 days" height={180} />
            )}
          </div>

          <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Metric label="Events scored" value={risk.data?.eventCount ?? <EmptyValue />} />
            <Metric label="Sources" value={risk.data?.sourceCount ?? <EmptyValue />} />
            <Metric label="7d low" value={series?.low ?? <EmptyValue />} />
            <Metric label="7d high" value={series?.high ?? <EmptyValue />} />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <p className="type-timestamp text-muted-foreground">
              {GRI_METHODOLOGY.definition} {GRI_METHODOLOGY.notProbability}
            </p>
            {risk.data ? <GriProofDialog risk={risk.data} /> : null}
          </div>
        </div>

        <div className="min-w-0 rounded-[var(--radius-card)] border border-border/70 bg-card/40 p-5">
          <h3 className="type-meta text-muted-foreground">Top risks</h3>
          <div className="mt-3">
            {intel.status === "loading" ? (
              <SectionLoadingState label="Loading top risks" />
            ) : intel.status === "error" ? (
              <ErrorState error={intel.error ?? undefined} onRetry={intel.retry} />
            ) : intel.data && intel.data.topRisks.length > 0 ? (
              <RankedPanel events={intel.data.topRisks.slice(0, 6)} />
            ) : (
              <UnavailableSurface
                title="No scored events yet"
                description="Top risks appear once the pipeline scores new events."
              />
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="min-w-0">
          <h3 className="type-section-heading text-foreground">Recent intelligence</h3>
          <div className="mt-3 grid gap-4">
            {intel.data ? (
              intel.data.today.slice(0, 2).map((e) => <EventIntelCard key={e.id} event={e} />)
            ) : (
              <SectionLoadingState label="Loading intelligence" />
            )}
          </div>
        </div>
        <div className="min-w-0 space-y-4">
          <div>
            <h3 className="type-section-heading text-foreground">Fast-moving signals</h3>
            <div className="mt-3">
              {intel.data?.fastestMoving ? (
                <RankedPanel
                  events={intel.data.fastestMoving}
                  metaFor={(e) =>
                    e.delta === null
                      ? undefined
                      : `${e.delta > 0 ? "+" : ""}${Math.round(e.delta)} risk`
                  }
                />
              ) : (
                <UnavailableSurface
                  title="No recorded risk movement"
                  description="Movement is only shown when a stored event carries a severity change."
                />
              )}
            </div>
          </div>
          <div>
            <h3 className="type-section-heading text-foreground">Market divergences</h3>
            <div className="mt-3">
              <UnavailableSurface
                title="Divergences unavailable"
                description="Comparing Geomacro risk with market-implied probability requires staked market positions, which are not recorded for these events yet."
              />
            </div>
          </div>
        </div>
      </div>

      {risk.data?.usedFallbackWindow && (
        <p className="mt-4 type-timestamp text-muted-foreground">
          The last 24 hours contained no new scored events, so a wider window is shown.
        </p>
      )}
    </HomeSection>
  );
}
