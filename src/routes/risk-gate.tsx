import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, KeyRound, Route as RouteIcon, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const TITLE = "Risk Gate Private Pilot · Geomacro";
const DESCRIPTION =
  "Country and corridor risk checks for treasury, payment and agent workflows. Risk Gate returns a signed, policy-aware recommendation before execution.";
const OUTPUTS = ["CONTINUE", "REDUCE_LIMIT", "REQUIRE_APPROVAL", "PAUSE"] as const;

export const Route = createFileRoute("/risk-gate")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://geomacro.live/risk-gate" },
      { property: "og:image", content: "https://geomacro.live/og-signal-card-v2.png" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://geomacro.live/risk-gate" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "Geomacro Risk Gate",
          applicationCategory: "BusinessApplication",
          url: "https://geomacro.live/risk-gate",
          description: DESCRIPTION,
          offers: { "@type": "Offer", availability: "https://schema.org/LimitedAvailability" },
        }),
      },
    ],
  }),
  component: RiskGatePage,
});

function RiskGatePage() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
      <section className="max-w-4xl">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="border-amber-400/40 bg-amber-400/5 font-mono text-[11px] text-amber-300">
            PRIVATE PILOT
          </Badge>
          <Badge variant="outline" className="font-mono text-[11px]">LIVE PUBLIC DEMO AVAILABLE</Badge>
        </div>
        <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl">
          Check geopolitical risk before a financial action moves forward.
        </h1>
        <p className="mt-5 max-w-3xl text-lg leading-relaxed text-muted-foreground">
          Risk Gate checks the current country or corridor risk, verifies the signed Geomacro Risk Object and applies the customer's policy. It returns a recommendation; the customer keeps control of execution.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild size="lg" className="gap-2">
            <Link to="/demo">Run live demo <ArrowRight className="h-4 w-4" /></Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/contact">Request Private Pilot</Link>
          </Button>
          <Button asChild size="lg" variant="ghost">
            <Link to="/docs/$slug" params={{ slug: "22-machine-readable-risk-objects" }}>
              Read Risk Object docs
            </Link>
          </Button>
        </div>
        <p className="mt-5 max-w-3xl text-xs leading-relaxed text-muted-foreground">
          The current corridor model compares the risk at the two endpoints. It is a pilot model, not full route, logistics or counterparty analysis. Event-specific Risk Objects are not part of the live Private Pilot contract yet.
        </p>
      </section>

      <section className="mt-14 grid gap-5 lg:grid-cols-3">
        {[
          ["1", "Action to review", "A treasury system, payment workflow or agent sends the country or corridor context and the customer's policy."],
          ["2", "Risk checked", "Geomacro verifies the Risk Object, signature, methodology, freshness and required risk inputs."],
          ["3", "Recommendation returned", "Risk Gate applies the supplied policy and returns a decision for the customer's own control system."],
        ].map(([step, title, body]) => (
          <article key={step} className="rounded-2xl border border-border/70 bg-card/50 p-6">
            <span className="font-mono text-xs text-primary">STEP {step}</span>
            <h2 className="mt-3 text-lg font-semibold">{title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
          </article>
        ))}
      </section>

      <section className="mt-14 rounded-2xl border border-border/70 bg-card/50 p-6 sm:p-8">
        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Control boundary</p>
            <h2 className="mt-3 text-2xl font-semibold">A recommendation, not permission to move money.</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Geomacro provides external geopolitical and macro risk context and evaluates the customer's policy. It does not hold funds, sign the customer's wallet or make the customer's final compliance or fiduciary decision.
            </p>
            <div className="mt-5 rounded-xl border border-border/60 bg-background/30 p-4 font-mono text-xs">
              execution_authorized = false
            </div>
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

      <section className="mt-14 grid gap-5 md:grid-cols-3">
        <article className="rounded-2xl border border-border/70 bg-card/50 p-6">
          <KeyRound className="h-5 w-5 text-primary" />
          <h2 className="mt-3 text-lg font-semibold">Signed Risk Objects</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Each Risk Object is versioned and signed with Ed25519 so the receiving system can verify what it received and who issued it.
          </p>
        </article>
        <article className="rounded-2xl border border-border/70 bg-card/50 p-6">
          <RouteIcon className="h-5 w-5 text-primary" />
          <h2 className="mt-3 text-lg font-semibold">Country + directional corridor</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            The current API supports country subjects and directional corridors built from their endpoints. It does not claim full physical-route or counterparty modelling.
          </p>
        </article>
        <article className="rounded-2xl border border-border/70 bg-card/50 p-6">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h2 className="mt-3 text-lg font-semibold">Fail-closed controls</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Authentication, validation, rate limits, signature checks, freshness checks and audit records are part of the Private Pilot. If the risk context cannot be verified, Risk Gate does not quietly treat it as approval.
          </p>
        </article>
      </section>

      <section className="mt-14 grid gap-5 lg:grid-cols-2">
        <article className="rounded-2xl border border-border/70 bg-card/50 p-6">
          <h2 className="text-xl font-semibold">What works in the Private Pilot</h2>
          <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
            <li>• signed GRO creation and verification</li>
            <li>• authenticated country and directional corridor API</li>
            <li>• database-backed per-client rate limiting</li>
            <li>• immutable decision audit contract</li>
            <li>• fail-closed pre-flight policy evaluation</li>
            <li>• customer-owned downstream execution</li>
          </ul>
        </article>
        <article className="rounded-2xl border border-border/70 bg-card/50 p-6">
          <h2 className="text-xl font-semibold">What still has to be completed before production</h2>
          <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
            <li>• independent externally reachable surface security review</li>
            <li>• real staging HTTP/database load evidence</li>
            <li>• final commercial source-rights clearance for the paid path</li>
            <li>• broader corridor-methodology validation</li>
            <li>• design-partner and willingness-to-pay validation</li>
            <li>• production SLA/operations evidence before any SLA claim</li>
          </ul>
        </article>
      </section>
    </main>
  );
}