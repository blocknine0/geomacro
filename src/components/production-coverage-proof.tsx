import { Link, useRouterState } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const VERIFIED_COUNTRY_COUNT = 114;
const ENABLED_SOVEREIGN_DENOMINATOR = 194;
const FAIL_CLOSED_COUNTRY_COUNT = 80;
const QPSD_ACCEPTED_FISCAL_COUNT = 57;
const PPG_ACCEPTED_FISCAL_COUNT = 57;

export function ProductionCoverageProof() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  // Keep the homepage focused on product comprehension and curiosity.
  // This dated methodology evidence belongs on deeper trust / product surfaces.
  if (pathname === "/") return null;

  return (
    <section className="border-b border-border/60 bg-card/20">
      <div className="mx-auto w-full max-w-7xl px-4 py-3 sm:px-6">
        <div className="flex flex-col gap-4 rounded-xl border border-border/70 bg-background/55 px-4 py-4 backdrop-blur-sm lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className="border-primary/35 bg-primary/5 font-mono text-[9px] uppercase tracking-[0.14em] text-primary"
              >
                Controlled coverage evidence · verified 16 Sep 2026
              </Badge>
              <span className="font-mono text-[10px] text-muted-foreground">
                {VERIFIED_COUNTRY_COUNT}/{ENABLED_SOVEREIGN_DENOMINATOR} accepted · {FAIL_CLOSED_COUNTRY_COUNT} fail-closed
              </span>
            </div>
            <div className="mt-2 flex items-start gap-2.5">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  114 sovereign countries passed the current four-module Risk Gate review census.
                </p>
                <p className="mt-1 max-w-4xl text-xs leading-relaxed text-muted-foreground">
                  A controlled workflow evaluated all 194 enabled sovereign countries; 80 remained fail-closed. Missing or unverified inputs are not converted into approval, and every accepted result keeps execution_authorized=false.
                </p>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <span className="hidden font-mono text-[10px] text-muted-foreground xl:inline">
              Fiscal paths: {QPSD_ACCEPTED_FISCAL_COUNT} QPSD + {PPG_ACCEPTED_FISCAL_COUNT} PPG
            </span>
            <Button asChild size="sm" variant="outline">
              <Link to="/risk-gate">Review Risk Gate</Link>
            </Button>
            <Button asChild size="sm" variant="ghost" className="gap-1.5">
              <Link to="/research">Evidence & limits <ArrowRight className="h-3.5 w-3.5" /></Link>
            </Button>
          </div>
        </div>
        <p className="sr-only">
          This evidence did not activate x402, real-money payments, Base mainnet or autonomous execution. Claim boundary: this is a dated controlled-workflow coverage result for the current Risk Gate methodology. It is not an all-country product guarantee, transaction authorization, production SLA, independent security audit or mainnet-launch claim, and it does not imply that every product is deliverable for every accepted country or request shape.
        </p>
      </div>
    </section>
  );
}

export function ProductionCoverageBoundaryIcon() {
  return <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />;
}
