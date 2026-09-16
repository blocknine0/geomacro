import { Link } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const VERIFIED_COUNTRY_COUNT = 114;
const ENABLED_SOVEREIGN_DENOMINATOR = 194;
const FAIL_CLOSED_COUNTRY_COUNT = 80;
const QPSD_ACCEPTED_FISCAL_COUNT = 57;
const PPG_ACCEPTED_FISCAL_COUNT = 57;

export function ProductionCoverageProof() {
  return (
    <section className="border-b border-border/60 bg-primary/[0.025]">
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-7">
        <div className="rounded-2xl border border-primary/20 bg-card/55 p-5 shadow-sm backdrop-blur-sm sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <Badge
                variant="outline"
                className="border-primary/35 bg-primary/5 font-mono text-[10px] uppercase tracking-[0.15em] text-primary"
              >
                Production workflow evidence · verified 16 Sep 2026
              </Badge>
              <h2 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">
                114 sovereign countries passed the current four-module Risk Gate review census.
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
                The controlled production workflow evaluated all 194 enabled sovereign countries. 114 had every required current module verified and 80 remained fail-closed. Missing or unverified inputs are not converted into approval.
              </p>
            </div>

            <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4 lg:w-[470px] lg:grid-cols-2">
              <Metric value={String(VERIFIED_COUNTRY_COUNT)} label="Accepted" />
              <Metric value={String(FAIL_CLOSED_COUNTRY_COUNT)} label="Fail-closed" />
              <Metric value={String(ENABLED_SOVEREIGN_DENOMINATOR)} label="Evaluated" />
              <Metric value={`${QPSD_ACCEPTED_FISCAL_COUNT} + ${PPG_ACCEPTED_FISCAL_COUNT}`} label="QPSD + PPG accepted fiscal paths" />
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <ProofPoint text="All 114 accepted results keep execution_authorized=false." />
            <ProofPoint text="QPSD promotion passed the 100+ country gate and remains active; governed PPG fallback remains available." />
            <ProofPoint text="This proof did not activate x402, real-money payments, Base mainnet or autonomous execution." />
          </div>

          <div className="mt-5 flex flex-col justify-between gap-4 border-t border-border/60 pt-5 sm:flex-row sm:items-center">
            <p className="max-w-3xl text-xs leading-relaxed text-muted-foreground">
              Claim boundary: this is production-workflow-verified country-review coverage for the current Risk Gate methodology. It is not an all-country claim, transaction authorization, production SLA, independent audit or mainnet launch claim.
            </p>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button asChild size="sm" variant="outline">
                <Link to="/risk-gate">Risk Gate</Link>
              </Button>
              <Button asChild size="sm" variant="ghost" className="gap-1.5">
                <Link to="/research">Methodology <ArrowRight className="h-3.5 w-3.5" /></Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-background/40 px-4 py-3">
      <div className="font-mono text-xl font-semibold text-foreground">{value}</div>
      <div className="mt-1 text-[11px] leading-snug text-muted-foreground">{label}</div>
    </div>
  );
}

function ProofPoint({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-border/60 bg-background/30 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <span>{text}</span>
    </div>
  );
}

export function ProductionCoverageBoundaryIcon() {
  return <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />;
}
