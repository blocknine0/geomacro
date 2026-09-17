import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, KeyRound, Route as RouteIcon, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const TITLE = "Risk Gate Roadmap & Private Pilot · Geomacro";
const DESCRIPTION =
  "Geomacro's controlled roadmap for country and corridor risk checks before treasury, payment and agent actions. Private Pilot validation exists, but Risk Gate is not generally available production software.";
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
          "@type": "WebPage",
          name: "Geomacro Risk Gate roadmap",
          url: "https://geomacro.live/risk-gate",
          description: DESCRIPTION,
          isPartOf: { "@type": "WebSite", name: "Geomacro", url: "https://geomacro.live/" },
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
        <Badge variant="outline" className="border-amber-400/40 bg-amber-400/5 font-mono text-[11px] text-amber-300">
          ROADMAP · PRIVATE PILOT
        </Badge>
        <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl">
          Check external risk before a financial action moves forward.
        </h1>
        <p className="mt-5 max-w-3xl text-lg leading-relaxed text-muted-foreground">
          Risk Gate is the planned decision layer around Geomacro intelligence. The controlled Private Pilot verifies a signed country or corridor Risk Object and returns bounded risk context. The customer's own identity, permissions and policy layer decides what happens next, and the customer keeps control of execution.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild size="lg" className="gap-2">
            <Link to="/contact">Discuss a Private Pilot <ArrowRight className="h-4 w-4" /></Link>
          </Button>
          <Button asChild size="lg" variant="outline"><Link to="/intelligence">Use live intelligence</Link></Button>
          <Button asChild size="lg" variant="ghost"><Link to="/roadmap">View roadmap</Link></Button>
        </div>
        <p className="mt-5 max-w-3xl text-xs leading-relaxed text-muted-foreground">
          Not generally available production software. The current corridor model compares endpoint risk and eligible bilateral evidence. It is not full route, logistics, counterparty, sanctions or compliance analysis. Event-specific Risk Objects are not in the current controlled scope.
        </p>
      </section>

      <section className="mt-12 grid gap-4 md:grid-cols-3">
        <StatusCard label="LIVE NOW" title="Risk Intelligence" body="Public event intelligence, evidence and current risk context can be evaluated today." to="/intelligence" />
        <StatusCard label="LIVE NOW" title="Separate Risk Indices" body="Geopolitical, macroeconomic and critical-mineral risk are published separately." to="/global-risk" />
        <StatusCard label="ROADMAP · PRIVATE PILOT" title="Risk Gate" body="Controlled validation exists, but production commercial availability remains gated." to="/roadmap" />
      </section>

      <section className="mt-14">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Planned workflow</p>
        <h2 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight">Risk context in. Customer decision out.</h2>
        <div className="mt-7 grid gap-5 lg:grid-cols-3">
          {[
            ["1", "Action to review", "A treasury system, payment workflow or agent submits a country or directional-corridor context for review."],
            ["2", "Geomacro verifies context", "Risk Gate checks the Risk Object, signature, methodology, freshness and required inputs, then returns bounded decision context."],
            ["3", "Customer stays in control", "The customer's own identity, permissions and policy layer applies its rules and controls any downstream action."],
          ].map(([step, title, body]) => (
            <article key={step} className="rounded-2xl border border-border/70 bg-card/50 p-6">
              <span className="font-mono text-xs text-primary">STEP {step}</span>
              <h3 className="mt-3 text-lg font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-14 rounded-2xl border border-border/70 bg-card/50 p-6 sm:p-8">
        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Control boundary</p>
            <h2 className="mt-3 text-2xl font-semibold">A risk recommendation is not permission to move money.</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Geomacro supplies external geopolitical and macro risk context. It does not own customer identity or permissions, hold funds, sign a customer wallet, replace sanctions/compliance screening, or make the customer's final fiduciary decision.
            </p>
            <div className="mt-5 rounded-xl border border-border/60 bg-background/30 p-4 font-mono text-xs">execution_authorized = false</div>
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
          <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.16em] text-amber-300">PRIVATE PILOT</p>
          <h2 className="mt-2 text-lg font-semibold">Signed Risk Objects</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Versioned and Ed25519-signed objects let a receiving system verify the issuer and inspect the context it received.</p>
        </article>
        <article className="rounded-2xl border border-border/70 bg-card/50 p-6">
          <RouteIcon className="h-5 w-5 text-primary" />
          <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.16em] text-amber-300">CONTROLLED SCOPE</p>
          <h2 className="mt-2 text-lg font-semibold">Country + directional corridor</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">The controlled scope covers country subjects and directional corridors composed from endpoints plus eligible bilateral evidence. Full physical-route and counterparty modelling are not claimed.</p>
        </article>
        <article className="rounded-2xl border border-border/70 bg-card/50 p-6">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.16em] text-amber-300">PRIVATE PILOT</p>
          <h2 className="mt-2 text-lg font-semibold">Fail-closed controls</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Authentication, validation, rate limits, signature and freshness checks, and audit records are part of the controlled design. Unverified context must not silently become approval.</p>
        </article>
      </section>

      <section className="mt-14 grid gap-5 lg:grid-cols-2">
        <article className="rounded-2xl border border-border/70 bg-card/50 p-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-amber-300">VALIDATED IN CONTROLLED PRIVATE PILOT</p>
          <h2 className="mt-2 text-xl font-semibold">What exists today</h2>
          <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
            <li>• signed Risk Object creation and verification</li>
            <li>• authenticated country and directional-corridor interfaces</li>
            <li>• database-backed per-client rate limiting</li>
            <li>• immutable decision-audit contract design</li>
            <li>• fail-closed pre-flight risk evaluation</li>
            <li>• customer-owned identity, permissions, policy and downstream execution</li>
          </ul>
        </article>
        <article className="rounded-2xl border border-primary/25 bg-primary/[0.04] p-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">PRODUCTION LAUNCH GATES</p>
          <h2 className="mt-2 text-xl font-semibold">What must be completed before launch</h2>
          <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
            <li>• independent security review of externally reachable surfaces</li>
            <li>• real staging HTTP/database load and resilience evidence</li>
            <li>• final commercial source-rights clearance for paid delivery</li>
            <li>• broader corridor-methodology validation</li>
            <li>• design-partner and willingness-to-pay validation</li>
            <li>• production operations and SLA evidence before any SLA claim</li>
          </ul>
        </article>
      </section>

      <section className="mt-14 rounded-2xl border border-primary/25 bg-primary/[0.04] p-7 sm:p-9">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">DESIGN PARTNERS</p>
        <div className="mt-3 flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <h2 className="text-2xl font-semibold">Have one real country, corridor or treasury decision to test?</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">A Private Pilot is for validating a narrow workflow and its business value. It is not a production deployment or a promise of general availability.</p>
          </div>
          <Button asChild size="lg" className="shrink-0"><Link to="/contact">Discuss the workflow</Link></Button>
        </div>
      </section>
    </main>
  );
}

function StatusCard({ label, title, body, to }: { label: string; title: string; body: string; to: "/intelligence" | "/global-risk" | "/roadmap" }) {
  return (
    <article className="rounded-2xl border border-border/70 bg-card/40 p-5">
      <p className={`font-mono text-[10px] uppercase tracking-[0.16em] ${label.startsWith("LIVE") ? "text-primary" : "text-amber-300"}`}>{label}</p>
      <h2 className="mt-2 text-lg font-semibold">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
      <Button asChild variant="link" className="mt-3 h-auto p-0 text-xs"><Link to={to}>Learn more <ArrowRight className="ml-1 h-3 w-3" /></Link></Button>
    </article>
  );
}
