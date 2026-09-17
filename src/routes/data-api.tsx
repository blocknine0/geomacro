import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Bot, Braces, CheckCircle2, Database, LockKeyhole, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AgentCommerceStatus } from "@/components/agent-commerce-status";

const TITLE = "Data & API | Geomacro";
const DESCRIPTION =
  "Geomacro public risk intelligence is live. This page shows the current governed machine-delivery, Risk Object, Risk Gate and x402 commercial-access status without hardcoding pre-launch capabilities as production.";
const URL = "https://geomacro.live/data-api";

const MACHINE_OUTPUTS = [
  ["Governed country data", "Commercially eligible observations, provenance, coverage and explicit missing-data states."],
  ["Directional corridor context", "Endpoint-composed country context plus eligible bilateral evidence when it exists."],
  ["Signed Risk Objects", "Versioned machine-readable risk state with evidence, confidence, freshness and integrity metadata."],
  ["Risk Gate output", "Bounded decision context for a customer-controlled policy workflow. Geomacro does not authorize execution."],
] as const;

export const Route = createFileRoute("/data-api")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: URL },
      { property: "og:image", content: "https://geomacro.live/og-image-v2.png" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: URL }],
  }),
  component: DataApiPage,
});

function DataApiPage() {
  return (
    <main>
      <section className="border-b border-border/60">
        <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 md:py-18">
          <Badge variant="outline" className="font-mono text-[10px] uppercase tracking-[0.14em]">
            GOVERNED DATA · CONTROLLED API · AGENT ACCESS
          </Badge>
          <h1 className="mt-5 max-w-4xl text-4xl font-semibold tracking-tight sm:text-5xl md:text-6xl">
            Public risk intelligence for people. Governed machine delivery for software and agents.
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg">
            Public intelligence and separate Risk Indices are live today. Signed Risk Objects and Risk Gate remain controlled Private Pilot capabilities. Real-money x402 access stays fail-closed until the production endpoint itself advertises an authorized production configuration.
          </p>
          <div className="mt-7 max-w-2xl"><AgentCommerceStatus /></div>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg" className="gap-2">
              <Link to="/intelligence">Explore public product <ArrowRight className="h-4 w-4" /></Link>
            </Button>
            <Button asChild size="lg" variant="outline"><Link to="/docs">Read technical documentation</Link></Button>
            <Button asChild size="lg" variant="ghost"><Link to="/contact">Discuss machine access</Link></Button>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="max-w-3xl">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Availability</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">Know exactly what is available before you integrate.</h2>
        </div>
        <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          <StatusCard icon={Database} status="LIVE" title="Public intelligence" text="Current geopolitical, macroeconomic and critical-mineral intelligence with evidence and recorded risk context." />
          <StatusCard icon={ShieldCheck} status="LIVE" title="Risk Indices" text="Separate geopolitical, macroeconomic and critical-mineral risk indices with methodology context." />
          <StatusCard icon={Bot} status="PRIVATE PILOT" title="Risk Objects & Risk Gate" text="Signed country and directional-corridor Risk Objects and bounded Risk Gate responses remain controlled Private Pilot capabilities." />
          <StatusCard icon={Braces} status="RUNTIME STATUS ABOVE" title="x402 agent access" text="Commercial machine-payment status is read from the live x402 endpoint rather than asserted by static website copy." />
        </div>
        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
          Free Explorer is website/dashboard access, not a free API. Machine delivery is governed separately and its availability is stated explicitly above.
        </p>
      </section>

      <section className="border-y border-border/60 bg-card/20">
        <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Machine-delivery contract</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">One governed intelligence foundation, multiple delivery layers.</h2>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              API, agent and payment protocols are adapters around canonical Geomacro intelligence. They do not create a separate score engine or bypass source-rights, availability, security or Risk Gate controls.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {MACHINE_OUTPUTS.map(([title, text]) => (
              <article key={title} className="rounded-xl border border-border/70 bg-background/35 p-5">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <h3 className="mt-3 font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="grid gap-5 lg:grid-cols-3">
          <Boundary title="Country scope" text="Current controlled design focuses on country and directional corridor context. Broader route, counterparty or logistics-path modelling is not claimed." />
          <Boundary title="Corridor model" text="The controlled design uses ENDPOINT_COMPOSED_V0_1. route_modeling_status = NOT_MODELED unless a future validated model explicitly changes that boundary." />
          <Boundary title="Execution boundary" text="Risk Gate returns context and recommendation only. execution_authorized=false; customer identity, permissions, policy and execution remain customer-controlled." />
        </div>
      </section>

      <section className="border-y border-border/60 bg-card/20">
        <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
          <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <LockKeyhole className="h-5 w-5 text-primary" />
              <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Commercial launch gates</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight">No production label before the controls are real.</h2>
            </div>
            <ul className="grid gap-3 text-sm leading-relaxed text-muted-foreground sm:grid-cols-2">
              <li className="rounded-xl border border-border/70 bg-background/35 p-4">Source rights and customer-serving eligibility verified.</li>
              <li className="rounded-xl border border-border/70 bg-background/35 p-4">Entitlement, authentication, replay and leakage controls acceptance-tested.</li>
              <li className="rounded-xl border border-border/70 bg-background/35 p-4">Security and resilience findings remediated to the required launch threshold.</li>
              <li className="rounded-xl border border-border/70 bg-background/35 p-4">Observable delivery, audit trail, rate limits and failure behavior documented.</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="rounded-2xl border border-primary/25 bg-primary/5 p-7 sm:p-9">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Machine access</p>
          <div className="mt-3 flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div>
              <h2 className="text-2xl font-semibold">Have a real country, corridor or agent workflow?</h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Share the decision point, required data, latency expectations and integration boundary. Geomacro will state which parts are live, Private Pilot or not yet supported before any commercial commitment.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-3">
              <Button asChild><Link to="/contact">Discuss machine access</Link></Button>
              <Button asChild variant="outline"><Link to="/roadmap">Open roadmap</Link></Button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function StatusCard({ icon: Icon, status, title, text }: { icon: typeof Database; status: string; title: string; text: string }) {
  return (
    <article className="rounded-2xl border border-border/70 bg-card/45 p-6">
      <div className="flex items-center justify-between gap-3">
        <Icon className="h-5 w-5 text-primary" />
        <span className="font-mono text-[9px] uppercase tracking-[0.13em] text-muted-foreground">{status}</span>
      </div>
      <h3 className="mt-4 text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{text}</p>
    </article>
  );
}

function Boundary({ title, text }: { title: string; text: string }) {
  return (
    <article className="rounded-2xl border border-border/70 bg-card/45 p-6">
      <ShieldCheck className="h-5 w-5 text-primary" />
      <h2 className="mt-4 text-lg font-semibold">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{text}</p>
    </article>
  );
}
