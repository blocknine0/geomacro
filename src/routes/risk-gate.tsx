import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, KeyRound, Route as RouteIcon, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const TITLE = "Risk Gate Roadmap & Private Pilot · Geomacro";
const DESCRIPTION =
  "Geomacro's controlled roadmap for country and corridor risk checks before treasury, payment and agent actions. Private Pilot validation exists, but Risk Gate is not generally available production software.";
const OUTPUTS = ["CONTINUE", "REDUCE_LIMIT", "REQUIRE_APPROVAL", "PAUSE"] as const;

export const Route = createFileRoute("/risk-gate")({
  head: () => ({ meta: [{ title: TITLE }, { name: "description", content: DESCRIPTION }], links: [{ rel: "canonical", href: "https://geomacro.live/risk-gate" }] }),
  component: RiskGatePage,
});

function RiskGatePage() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
      <section className="max-w-4xl">
        <Badge variant="outline" className="border-amber-400/40 bg-amber-400/5 font-mono text-[11px] text-amber-300">ROADMAP · PRIVATE PILOT</Badge>
        <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl">Check external risk before a financial action moves forward.</h1>
        <p className="mt-5 max-w-3xl text-lg leading-relaxed text-muted-foreground">Risk Gate is the planned decision layer around Geomacro intelligence. The controlled Private Pilot verifies a signed country or corridor Risk Object and returns bounded country or corridor risk context. The customer's own identity, permissions and policy layer decides what happens next, and the customer keeps control of execution.</p>
        <div className="mt-8 flex flex-wrap gap-3"><Button asChild size="lg"><Link to="/contact">Discuss a Private Pilot <ArrowRight className="h-4 w-4" /></Link></Button><Button asChild size="lg" variant="outline"><Link to="/intelligence">Use live intelligence</Link></Button></div>
        <p className="mt-5 max-w-3xl text-xs leading-relaxed text-muted-foreground">Not generally available production software. Current scope covers country subjects and directional corridors built from their endpoints plus eligible bilateral evidence. It does not claim full physical-route or counterparty modelling. Event-specific Risk Objects are not in the current controlled scope.</p>
      </section>
      <section className="mt-14 rounded-2xl border border-border/70 bg-card/50 p-6 sm:p-8">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Control boundary</p>
        <h2 className="mt-3 text-2xl font-semibold">A risk recommendation is not permission to move money.</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">Geomacro supplies external geopolitical and macro risk context. Customer identity, permissions, policy, funds and downstream execution remain customer-controlled.</p>
        <div className="mt-5 rounded-xl border border-border/60 bg-background/30 p-4 font-mono text-xs">execution_authorized = false</div>
        <div className="mt-5 grid gap-2 sm:grid-cols-2">{OUTPUTS.map((output) => <div key={output} className="flex items-center gap-2 rounded-xl border border-border/60 px-4 py-3 font-mono text-sm"><CheckCircle2 className="h-4 w-4 text-primary" />{output}</div>)}</div>
      </section>
      <section className="mt-14 grid gap-5 md:grid-cols-3">
        <article className="rounded-2xl border border-border/70 bg-card/50 p-6"><KeyRound className="h-5 w-5 text-primary" /><h2 className="mt-4 text-lg font-semibold">Signed Risk Objects</h2><p className="mt-2 text-sm text-muted-foreground">Versioned and Ed25519-signed objects support issuer and integrity verification.</p></article>
        <article className="rounded-2xl border border-border/70 bg-card/50 p-6"><RouteIcon className="h-5 w-5 text-primary" /><h2 className="mt-4 text-lg font-semibold">Country + directional corridor</h2><p className="mt-2 text-sm text-muted-foreground">Controlled scope is country and endpoint-composed directional corridor context.</p></article>
        <article className="rounded-2xl border border-border/70 bg-card/50 p-6"><ShieldCheck className="h-5 w-5 text-primary" /><h2 className="mt-4 text-lg font-semibold">Fail-closed controls</h2><p className="mt-2 text-sm text-muted-foreground">Unverified or stale context must not silently become approval.</p></article>
      </section>
    </main>
  );
}
