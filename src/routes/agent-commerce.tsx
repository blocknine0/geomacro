import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Database,
  LockKeyhole,
  Network,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const TITLE = "Agent Commerce · Geomacro";
const DESCRIPTION =
  "Machine-readable geopolitical and macro risk intelligence for autonomous agents, with fail-closed availability checks and x402 payment support.";

const FLOW = [
  ["1", "Plan", "The agent asks a bounded country or corridor risk question. Geomacro converts it into a deterministic query plan."],
  ["2", "Prove availability", "Required data, source rights, freshness and subject coverage are checked before any payment challenge is returned."],
  ["3", "Pay", "If the exact request is deliverable, x402 can advertise an exact USDC price and bind the payment proof to that query plan."],
  ["4", "Re-check", "Deliverability and agent spend policy are checked again before settlement."],
  ["5", "Prepare", "The complete governed response is assembled and durably prepared before settlement is attempted."],
  ["6", "Deliver", "After successful settlement, the agent receives the prepared intelligence plus request, payment and product audit references."],
] as const;

export const Route = createFileRoute("/agent-commerce")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:url", content: "https://geomacro.live/agent-commerce" },
    ],
    links: [{ rel: "canonical", href: "https://geomacro.live/agent-commerce" }],
  }),
  component: AgentCommercePage,
});

function AgentCommercePage() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
      <section className="max-w-5xl">
        <Badge variant="outline" className="font-mono text-[11px]">
          AGENT-NATIVE RISK INTELLIGENCE · X402 V2 · FAIL CLOSED
        </Badge>
        <h1 className="mt-5 max-w-4xl text-4xl font-semibold tracking-tight sm:text-5xl">
          Risk intelligence that software can inspect before it pays or acts.
        </h1>
        <p className="mt-5 max-w-3xl text-lg leading-relaxed text-muted-foreground">
          Geomacro turns geopolitical and macro evidence into structured decision context for software and autonomous agents. Payment is offered only when the exact requested product is currently deliverable. A successful response provides intelligence, provenance, freshness and an audit trail. It never signs or executes the customer&apos;s financial action.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild size="lg" className="gap-2">
            <Link to="/contact">
              Request a Founding Pilot <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/data-api">Data & API</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/risk-gate">Risk Gate</Link>
          </Button>
        </div>
      </section>

      <section className="mt-14 grid gap-5 lg:grid-cols-3">
        <article className="rounded-2xl border border-primary/25 bg-primary/[0.04] p-6">
          <Bot className="h-5 w-5 text-primary" />
          <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.16em] text-primary">ADAPTIVE PRODUCT</p>
          <h2 className="mt-2 text-xl font-semibold">Ask for the risk you need.</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Country and corridor requests can select macro, FX/external, geopolitical and governed current-event context. The question becomes a hash-bound query plan before payment.
          </p>
        </article>
        <article className="rounded-2xl border border-border/70 bg-card/50 p-6">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.16em] text-primary">SOURCE GOVERNANCE</p>
          <h2 className="mt-2 text-xl font-semibold">Missing evidence stays missing.</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Unsupported countries, stale modules, insufficient peer coverage and commercially unverified source paths fail closed. Missing data is never converted into zero risk or a payable response.
          </p>
        </article>
        <article className="rounded-2xl border border-border/70 bg-card/50 p-6">
          <LockKeyhole className="h-5 w-5 text-primary" />
          <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.16em] text-primary">EXECUTION BOUNDARY</p>
          <h2 className="mt-2 text-xl font-semibold">Context, not custody.</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Risk Gate may return CONTINUE, REDUCE LIMIT, REQUIRE APPROVAL or PAUSE context under customer policy, but Geomacro preserves <code>execution_authorized=false</code> and does not control customer funds.
          </p>
        </article>
      </section>

      <section className="mt-14 rounded-2xl border border-border/70 bg-card/50 p-6 sm:p-8">
        <div className="grid gap-8 lg:grid-cols-[0.82fr_1.18fr]">
          <div>
            <Network className="h-6 w-6 text-primary" />
            <p className="mt-4 font-mono text-xs uppercase tracking-[0.18em] text-primary">PAYMENT-SAFE FLOW</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">Availability before money.</h2>
            <p className="mt-4 text-sm leading-7 text-muted-foreground">
              The paid path is designed around one invariant: Geomacro should not accept payment for intelligence it cannot deliver. The same governed query plan follows the request through availability, payment binding, settlement and final response.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {FLOW.map(([number, title, text]) => (
              <div key={number} className="rounded-xl border border-border/70 bg-background/50 p-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full border border-primary/30 font-mono text-xs text-primary">
                    {number}
                  </span>
                  <h3 className="font-semibold">{title}</h3>
                </div>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-14 grid gap-6 lg:grid-cols-2">
        <article className="rounded-2xl border border-primary/25 bg-primary/[0.04] p-6 sm:p-8">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">MACHINE ENDPOINTS</p>
          <h2 className="mt-3 text-2xl font-semibold">Discover, check, then purchase.</h2>
          <div className="mt-5 space-y-4 text-sm">
            <div>
              <p className="text-muted-foreground">No-charge deliverability check</p>
              <code className="mt-1 block overflow-x-auto rounded-md bg-background/60 p-3">POST /api/x402/risk/availability</code>
            </div>
            <div>
              <p className="text-muted-foreground">Adaptive paid intelligence</p>
              <code className="mt-1 block overflow-x-auto rounded-md bg-background/60 p-3">POST /api/x402/intelligence</code>
            </div>
            <div>
              <p className="text-muted-foreground">Agent discovery</p>
              <code className="mt-1 block overflow-x-auto rounded-md bg-background/60 p-3">GET /.well-known/geomacro-agent.json</code>
            </div>
          </div>
          <p className="mt-5 text-xs leading-6 text-muted-foreground">
            x402 v2 uses the <code>PAYMENT-SIGNATURE</code> request header and <code>PAYMENT-REQUIRED</code> / <code>PAYMENT-RESPONSE</code> response headers. The exact price and accepted network are advertised by the server for the active environment.
          </p>
        </article>

        <article className="rounded-2xl border border-border/70 bg-card/50 p-6 sm:p-8">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">PRODUCTION STATUS</p>
          <h2 className="mt-3 text-2xl font-semibold">Prepared does not mean activated.</h2>
          <p className="mt-4 text-sm leading-7 text-muted-foreground">
            The production path is engineered for Base mainnet USDC, but real-funds activation remains owner-gated until the coordinated commercial launch is explicitly authorized. Testnet evidence is not represented as production revenue.
          </p>
          <ul className="mt-5 space-y-3 text-sm leading-6 text-muted-foreground">
            <li className="flex gap-2"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-primary" /> Query-bound exact payment requirements.</li>
            <li className="flex gap-2"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-primary" /> Replay, duplicate-settlement and ambiguous-settlement handling.</li>
            <li className="flex gap-2"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-primary" /> Per-agent spend and request controls before settlement.</li>
            <li className="flex gap-2"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-primary" /> Durable product and payment audit references.</li>
            <li className="flex gap-2"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-primary" /> Facilitator capability probe before production-readiness sign-off.</li>
          </ul>
        </article>
      </section>

      <section className="mt-14 rounded-2xl border border-border/70 bg-card/50 p-6 sm:p-8">
        <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr]">
          <div>
            <Database className="h-6 w-6 text-primary" />
            <p className="mt-4 font-mono text-xs uppercase tracking-[0.18em] text-primary">COVERAGE TRUTH</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">Coverage is measured, not typed into marketing copy.</h2>
          </div>
          <div className="text-sm leading-7 text-muted-foreground">
            <p>
              Geomacro targets broad sovereign coverage, including the current expansion toward at least 100 countries. A country becomes payable only after the required module chain passes the production census with compatible source definitions, commercial rights, freshness, confidence and provenance.
            </p>
            <p className="mt-4">
              Current-event coverage is also family-governed. War, sanctions, macro shocks, shipping, cyber, technology controls, health, displacement, climate, financial stress and other material families may be detected, but an event signal is never silently promoted into an authoritative structural claim.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
