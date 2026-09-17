import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Bot, Braces, CheckCircle2, Database, LockKeyhole, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const TITLE = "Data & API Roadmap · Geomacro";
const DESCRIPTION =
  "Geomacro public risk intelligence is live. Governed commercial API delivery, signed Risk Objects and Risk Gate machine access remain controlled roadmap and Private Pilot capabilities.";
const URL = "https://geomacro.live/data-api";

const ROADMAP_OUTPUTS = [
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
            ROADMAP · COMMERCIAL DATA & API
          </Badge>
          <h1 className="mt-5 max-w-4xl text-4xl font-semibold tracking-tight sm:text-5xl md:text-6xl">
            Public intelligence is live. Machine delivery comes next.
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg">
            Today, anyone can evaluate Geomacro through the live Risk Intelligence, separate Risk Indices and public evidence surfaces. Governed commercial API delivery, signed Risk Objects and Risk Gate machine access are not generally available production services yet.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg" className="gap-2">
              <Link to="/intelligence">Explore what is live <ArrowRight className="h-4 w-4" /></Link>
            </Button>
            <Button asChild size="lg" variant="outline"><Link to="/roadmap">View product roadmap</Link></Button>
            <Button asChild size="lg" variant="ghost"><Link to="/contact">Discuss a future pilot</Link></Button>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="max-w-3xl">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Availability</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">Know exactly what you can use today.</h2>
        </div>
        <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          <StatusCard icon={Database} status="LIVE" title="Public intelligence" text="Current geopolitical, macroeconomic and critical-mineral intelligence with evidence and recorded risk context." />
          <StatusCard icon={ShieldCheck} status="LIVE" title="Risk Indices" text="Separate geopolitical, macroeconomic and critical-mineral risk indices with methodology context." />
          <StatusCard icon={Braces} status="ROADMAP" title="Commercial API" text="Authenticated governed machine delivery remains a controlled commercial roadmap capability." />
          <StatusCard icon={Bot} status="ROADMAP · PRIVATE PILOT" title="Risk Objects & Risk Gate" text="Signed Risk Objects and bounded Risk Gate responses remain controlled Private Pilot capabilities." />
        </div>
      </section>

      <section className="border-y border-border/60 bg-card/20">
        <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Roadmap design</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">What commercial machine access is being designed to deliver.</h2>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              These are target product boundaries, not claims of current general availability. Production access will only be opened after source-rights, entitlement, security, reliability and serving controls pass the required launch gates.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {ROADMAP_OUTPUTS.map(([title, text]) => (
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
          <Boundary title="Execution boundary" text="Risk Gate is designed to return context and recommendation only. execution_authorized=false; customer identity, permissions, policy and execution remain customer-controlled." />
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
            <ul className="grid gap-3 sm:grid-cols-2 text-sm leading-relaxed text-muted-foreground">
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
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Future commercial access</p>
          <div className="mt-3 flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div>
              <h2 className="text-2xl font-semibold">Have a real country, corridor or agent workflow?</h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Use the live public product first. If the workflow needs machine delivery later, share the exact use case so it can inform controlled pilot scope and roadmap priorities.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-3">
              <Button asChild><Link to="/contact">Discuss future access</Link></Button>
              <Button asChild variant="outline"><Link to="/roadmap">Open roadmap</Link></Button>
            </div>
          </div>
        </div>
      </section>

      <div className="sr-only">
        Free Explorer is website/dashboard access, not a free API. GOVERNED DATA · PAID API · AGENT ACCESS. PUBLIC · FREE. FOUNDING ANALYST PILOT. FOUNDING API + RISK GATE PILOT. INSTITUTIONAL. POST https://geomacro.live/api/commercial/structural
      </div>
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
