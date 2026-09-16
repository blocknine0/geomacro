import { Link } from "@tanstack/react-router";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RiskBadge, RiskTrend } from "@/components/foundation/risk";
import type { PublicRiskIndices } from "@/lib/risk-indices.types";
import type { RiskIndicesStatus } from "@/lib/use-risk-indices";

export function RiskIndicesPreview({
  data,
  status,
}: {
  data: PublicRiskIndices | null;
  status: RiskIndicesStatus;
}) {
  return (
    <section className="border-y border-border/60 bg-card/20">
      <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-10 sm:px-6 sm:py-12 lg:grid-cols-[0.82fr_1.18fr] lg:items-center">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">
            Current verified risk indices
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            Three risks. Three separate readings.
          </h2>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">
            Geopolitical, macroeconomic and critical-mineral risk are shown independently so one domain does not hide movement in another. Each reading stays tied to the verified evidence and proof package behind it.
          </p>
          <Button asChild className="mt-6 gap-2">
            <Link to="/global-risk">
              Open the risk indices workspace <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {!data && status === "loading" ? (
            [0, 1, 2].map((item) => (
              <div key={item} className="min-h-[190px] animate-pulse rounded-2xl border border-border/70 bg-card/55 p-5">
                <div className="h-3 w-28 rounded bg-muted/60" />
                <div className="mt-5 h-14 w-24 rounded bg-muted/50" />
                <div className="mt-6 h-8 rounded bg-muted/30" />
              </div>
            ))
          ) : data ? (
            data.indices.map((index) => (
              <article key={index.key} className="rounded-2xl border border-border/70 bg-card/55 p-5">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                    {index.name}
                  </p>
                  <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
                </div>

                {index.status === "available" && index.score !== null ? (
                  <>
                    <div className="mt-4 flex flex-wrap items-end gap-2">
                      <span className="text-4xl font-semibold tabular-nums text-foreground">
                        {index.score}
                        <span className="ml-1 text-xs font-normal text-muted-foreground">/100</span>
                      </span>
                      {index.changePoints !== null ? <RiskTrend delta={index.changePoints} /> : null}
                    </div>
                    <div className="mt-3"><RiskBadge score={index.score} /></div>
                    <p className="mt-5 text-xs leading-5 text-muted-foreground">
                      {index.eventCount} evidence rows · {index.independentStoryCount} independent stories
                    </p>
                  </>
                ) : (
                  <div className="mt-5">
                    <p className="text-sm font-medium text-foreground">Refreshing verified reading</p>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      No synthetic or zero-risk substitute is shown.
                    </p>
                  </div>
                )}
              </article>
            ))
          ) : (
            ["Geopolitical Risk Index", "Macroeconomic Risk Index", "Critical Minerals Risk Index"].map((name) => (
              <article key={name} className="rounded-2xl border border-border/70 bg-card/55 p-5">
                <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">{name}</p>
                <p className="mt-5 text-sm font-medium text-foreground">Refreshing verified reading</p>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  Geomacro is retrying the verified data path automatically.
                </p>
              </article>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
