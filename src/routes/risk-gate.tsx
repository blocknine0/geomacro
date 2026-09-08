import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const TITLE = "Risk Gate Private Pilot · Geomacro";
const DESCRIPTION =
  "Pre-execution geopolitical and macro risk context for financial workflows and autonomous agents. Risk Gate is available as a Private Pilot.";

const OUTPUTS = ["CONTINUE", "REDUCE_LIMIT", "REQUIRE_APPROVAL", "PAUSE", "REROUTE"] as const;

export const Route = createFileRoute("/risk-gate")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://geomacro.live/risk-gate" },
    ],
    links: [{ rel: "canonical", href: "https://geomacro.live/risk-gate" }],
  }),
  component: RiskGatePage,
});

function RiskGatePage() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
      <section className="max-w-4xl">
        <Badge variant="outline" className="border-amber-400/40 bg-amber-400/5 font-mono text-[11px] text-amber-300">
          PRIVATE PILOT
        </Badge>
        <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl">Risk context before financial execution.</h1>
        <p className="mt-5 max-w-3xl text-lg leading-relaxed text-muted-foreground">
          Risk Gate evaluates country, corridor and event risk before a financial workflow proceeds. It combines signed Geomacro Risk Objects with customer policy to return a machine-readable control recommendation and evidence trail.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild size="lg" className="gap-2">
            <Link to="/contact">Request Private Pilot <ArrowRight className="h-4 w-4" /></Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/docs">Read technical documentation</Link>
          </Button>
        </div>
      </section>

      <section className="mt-14 grid gap-5 lg:grid-cols-3">
        {[
          ["1", "Requested action", "A treasury workflow, payment service or autonomous agent submits the action context and policy to evaluate."],
          ["2", "Risk evaluation", "Geomacro checks subject-specific risk context, evidence, confidence, freshness and signed Risk Object integrity."],
          ["3", "Policy output", "Risk Gate returns a recommendation for the customer system to enforce under its own permissions and controls."],
        ].map(([step, title, body]) => (
          <article key={step} className="rounded-2xl border border-border/70 bg-card/50 p-6">
            <span className="font-mono text-xs text-primary">STEP {step}</span>
            <h2 className="mt-3 text-lg font-semibold">{title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
          </article>
        ))}
      </section>

      <section className="mt-14 rounded-2xl border border-border/70 bg-card/50 p-6 sm:p-8">
        <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Decision contract</p>
            <h2 className="mt-3 text-2xl font-semibold">Clear outputs for policy systems</h2>
            <p className="mt-3 text-muted-foreground">
              Risk Gate does not execute or authorize the customer transaction. It supplies external geopolitical and macro risk context that the customer or agent can apply inside its own control system.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {OUTPUTS.map((output) => (
              <div key={output} className="flex items-center gap-2 rounded-xl border border-border/60 bg-background/30 px-4 py-3 font-mono text-sm">
                <CheckCircle2 className="h-4 w-4 text-primary" /> {output}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-14 grid gap-5 md:grid-cols-2">
        <article className="rounded-2xl border border-border/70 bg-card/50 p-6">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h2 className="mt-3 text-xl font-semibold">Implemented Private Pilot controls</h2>
          <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
            <li>Signed Geomacro Risk Objects and verification</li>
            <li>Authenticated country and directional corridor API</li>
            <li>Rate limiting and immutable audit trail</li>
            <li>Fail-closed pre-flight policy evaluation</li>
            <li>Customer policy remains separate from the Geomacro risk engine</li>
          </ul>
        </article>
        <article className="rounded-2xl border border-border/70 bg-card/50 p-6">
          <h2 className="text-xl font-semibold">Current boundaries</h2>
          <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
            <li>Private Pilot, not a generally available production SLA</li>
            <li>Corridor risk is an endpoint-composed pilot, not full logistics-route modelling</li>
            <li>Geomacro does not autonomously execute customer transactions</li>
            <li>Independent external security review and full staging load evidence remain launch gates</li>
          </ul>
        </article>
      </section>
    </main>
  );
}
