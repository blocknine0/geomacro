import { Link } from "@tanstack/react-router";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RiskBadge, RiskTrend } from "@/components/foundation/risk";
import type { GlobalRisk, RiskStatus } from "@/lib/use-global-risk";
import type { UserError } from "@/lib/user-errors";

export function GriPreview({
  risk,
  status,
  error,
}: {
  risk: GlobalRisk | null;
  status: RiskStatus;
  error: UserError | null;
}) {
  const delta = risk && risk.previous !== null ? risk.score - risk.previous : null;

  return (
    <section className="border-y border-border/60 bg-card/20">
      <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-10 sm:px-6 sm:py-12 lg:grid-cols-[0.82fr_1.18fr] lg:items-center">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">
            Current global reading
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            Global Risk Index
          </h2>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">
            One verified reading of current geopolitical, macro and critical-mineral risk. The dedicated GRI workspace contains the history, exact change attribution, evidence, methodology and integrity proof.
          </p>
          <Button asChild className="mt-6 gap-2">
            <Link to="/global-risk">
              Open the full GRI workspace <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>

        <div className="rounded-2xl border border-border/70 bg-card/55 p-5 sm:p-6">
          {status === "loading" && !risk ? (
            <div className="space-y-4">
              <div className="h-16 w-40 animate-pulse rounded bg-muted/60" />
              <div className="h-20 animate-pulse rounded-xl bg-muted/30" />
            </div>
          ) : !risk ? (
            <div>
              <p className="font-medium text-foreground">Current verified reading unavailable</p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {error?.message ?? "Geomacro could not load the canonical GRI reading."}
              </p>
              <p className="mt-3 text-xs text-muted-foreground">
                The dedicated GRI page remains the canonical verification surface.
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                    Verified GRI · {risk.methodologyVersion}
                  </p>
                  <div className="mt-2 flex flex-wrap items-end gap-3">
                    <span className="text-6xl font-semibold tabular-nums text-foreground">
                      {risk.score}
                      <span className="ml-1 text-base font-normal text-muted-foreground">/100</span>
                    </span>
                    {delta !== null ? <RiskTrend delta={delta} /> : null}
                  </div>
                  <div className="mt-3">
                    <RiskBadge score={risk.score} />
                  </div>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-primary">
                  <ShieldCheck className="h-3.5 w-3.5" /> Verified
                </span>
              </div>

              <dl className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <PreviewMetric label="Evidence" value={String(risk.eventCount)} />
                <PreviewMetric label="Independent stories" value={String(risk.independentStoryCount)} />
                <PreviewMetric label="Coverage" value={`${Math.round(risk.coverage * 100)}%`} />
                <PreviewMetric
                  label="Confidence"
                  value={risk.weightedConfidence === null ? "—" : `${Math.round(risk.weightedConfidence)}%`}
                />
              </dl>

              {risk.topDriver ? (
                <div className="mt-5 border-t border-border/60 pt-4">
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    Leading current driver
                  </p>
                  <p className="mt-1 text-sm font-medium capitalize text-foreground">
                    {prettyDomain(risk.topDriver.category)} · score {risk.topDriver.score}
                  </p>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function PreviewMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/30 p-3">
      <dt className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-medium tabular-nums text-foreground">{value}</dd>
    </div>
  );
}

function prettyDomain(value: string) {
  if (value === "rare_earth") return "Critical minerals";
  return value.replace(/_/g, " ");
}
