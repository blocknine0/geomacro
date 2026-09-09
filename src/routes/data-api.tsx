import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Bot,
  Braces,
  CheckCircle2,
  Database,
  FileCheck2,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const TITLE = "Data, API & Agent · Geomacro";
const DESCRIPTION =
  "Connect to Geomacro's grounded AI-agent gateway and use governed geopolitical risk data, structural context, signed Risk Objects and Risk Gate outputs.";

const RISK_OBJECT_FIELDS = [
  ["Subject", "Country or directional corridor in the current controlled scope."],
  ["Risk state", "Current score or state, previous state and quantified change where available."],
  ["Attribution", "Drivers and contribution details that explain material movement."],
  ["Evidence", "Evidence references, coverage and provenance that can be delivered to the customer."],
  ["Confidence & freshness", "Confidence, generated time, expiry or freshness and degraded-state context."],
  ["Methodology", "Versioned schema and methodology identifiers plus integrity information."],
] as const;

const STRUCTURAL_FIELDS = [
  ["Observation", "Dimension, metric, numeric/text value, unit and observation time."],
  ["Geography", "Country ISO3 and partner-country ISO3 when an eligible bilateral record exists."],
  ["Provenance", "Source ID, source URL where permitted, parser version and retrieval time."],
  ["Integrity", "Quality/methodology status and normalized content hash."],
  ["Coverage", "Source, dimension, coverage year, observation count and latest observed time."],
  ["Missing data", "Explicit AVAILABLE, UNAVAILABLE or NOT_CONFIGURED state. Missing is never converted to zero risk."],
] as const;

export const Route = createFileRoute("/data-api")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:url", content: "https://geomacro.live/data-api" },
    ],
    links: [{ rel: "canonical", href: "https://geomacro.live/data-api" }],
  }),
  component: DataApiPage,
});

function DataApiPage() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
      <section className="max-w-4xl">
        <Badge variant="outline" className="font-mono text-[11px]">
          PUBLIC AGENT + PRIVATE PILOT DATA
        </Badge>
        <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl">
          Connect software and AI agents to Geomacro risk intelligence.
        </h1>
        <p className="mt-5 max-w-3xl text-lg leading-relaxed text-muted-foreground">
          Geomacro Agent provides a public grounded read layer. Qualified pilots can add governed country and corridor structural context, signed Risk Objects and Risk Gate recommendations for a real workflow.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild size="lg" className="gap-2">
            <Link to="/contact">
              Request a Founding Pilot <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/docs">Read technical documentation</Link>
          </Button>
        </div>
      </section>

      <section className="mt-14 rounded-2xl border border-primary/25 bg-primary/[0.04] p-6 sm:p-8">
        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <Bot className="h-6 w-6 text-primary" />
            <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.16em] text-primary">
              PUBLIC · GEOMACRO AGENT V1
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">
              One grounded agent gateway.
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              External software and AI agents can query Geomacro's stored intelligence through the same evidence engine used by Ask Geomacro. The public read path does not use external web search and does not invent a fallback GRI score.
            </p>
          </div>
          <div className="rounded-xl border border-border/70 bg-background/60 p-5">
            <p className="font-mono text-xs text-muted-foreground">Endpoint</p>
            <code className="mt-2 block break-all rounded-md bg-muted/50 p-3 text-xs">
              POST https://geomacro.live/api/agent/risk
            </code>
            <p className="mt-5 font-mono text-xs text-muted-foreground">Public request</p>
            <pre className="mt-2 overflow-x-auto rounded-md bg-muted/50 p-3 text-xs leading-relaxed">
{`{
  "capability": "intelligence_query",
  "question": "What is changing in critical-mineral risk?"
}`}
            </pre>
            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
              Machine discovery: <code>/.well-known/geomacro-agent.json</code>. The same gateway also advertises the controlled risk-preflight capability used for x402 technical proof and Private Pilot workflows.
            </p>
          </div>
        </div>
      </section>

      <section className="mt-14">
        <div className="max-w-3xl">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Access model</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight">Who gets what.</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            The public layer is intentionally useful without exposing the private historical warehouse. Deeper structural payloads move through a paid, scoped pilot until source rights, volume and support requirements are validated.
          </p>
        </div>

        <div className="mt-7 grid gap-5 lg:grid-cols-4">
          <article className="rounded-2xl border border-border/70 bg-card/50 p-6">
            <Database className="h-5 w-5 text-primary" />
            <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.16em] text-primary">PUBLIC · FREE</p>
            <h3 className="mt-2 text-xl font-semibold">Intelligence + Agent</h3>
            <ul className="mt-4 space-y-2 text-sm leading-relaxed text-muted-foreground">
              <li>Grounded Geomacro Agent queries.</li>
              <li>Public Risk Intelligence.</li>
              <li>Current verified GRI when eligible.</li>
              <li>Selected evidence and public methodology.</li>
            </ul>
          </article>

          <article className="rounded-2xl border border-primary/25 bg-primary/[0.04] p-6">
            <FileCheck2 className="h-5 w-5 text-primary" />
            <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.16em] text-primary">FOUNDING PILOT</p>
            <h3 className="mt-2 text-xl font-semibold">Structural analyst package</h3>
            <ul className="mt-4 space-y-2 text-sm leading-relaxed text-muted-foreground">
              <li>Governed country structural profile.</li>
              <li>Directional corridor endpoint context.</li>
              <li>Coverage, provenance and integrity metadata.</li>
              <li>Explicit missing-data state and founder review.</li>
            </ul>
          </article>

          <article className="rounded-2xl border border-primary/25 bg-primary/[0.04] p-6">
            <Braces className="h-5 w-5 text-primary" />
            <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.16em] text-primary">FOUNDING PILOT · API</p>
            <h3 className="mt-2 text-xl font-semibold">Risk API + Risk Gate</h3>
            <ul className="mt-4 space-y-2 text-sm leading-relaxed text-muted-foreground">
              <li>Machine-readable structural context.</li>
              <li>Signed country/corridor Risk Objects.</li>
              <li>Risk Gate recommendation and reason codes.</li>
              <li>Controlled rate limits and integration support.</li>
            </ul>
          </article>

          <article className="rounded-2xl border border-border/70 bg-card/50 p-6">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">VALIDATED EXPANSION</p>
            <h3 className="mt-2 text-xl font-semibold">Institutional scope</h3>
            <ul className="mt-4 space-y-2 text-sm leading-relaxed text-muted-foreground">
              <li>Additional approved countries/corridors.</li>
              <li>Deeper history or wider API volume.</li>
              <li>Custom exports or monitoring cadence.</li>
              <li>Only after rights, reliability and support review.</li>
            </ul>
          </article>
        </div>
      </section>

      <section className="mt-14 grid gap-8 lg:grid-cols-2">
        <article className="rounded-2xl border border-border/70 bg-card/50 p-6 sm:p-8">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Country structural profile</p>
          <h2 className="mt-3 text-2xl font-semibold">Historical context without a fabricated structural score.</h2>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            A country profile returns the newest commercially eligible observations available across governed structural dimensions plus source and coverage metadata. Missing dimensions remain missing.
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {STRUCTURAL_FIELDS.map(([title, text]) => (
              <div key={title} className="rounded-xl border border-border/70 bg-background/40 p-4">
                <h3 className="text-sm font-semibold">{title}</h3>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{text}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-2xl border border-border/70 bg-card/50 p-6 sm:p-8">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Directional corridor profile</p>
          <h2 className="mt-3 text-2xl font-semibold">Origin + destination + eligible bilateral evidence.</h2>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            The current corridor model composes the two endpoint country profiles and adds direct bilateral observations only when eligible evidence explicitly links the pair.
          </p>
          <ul className="mt-5 space-y-3 text-sm leading-relaxed text-muted-foreground">
            <li><code>composition_method = ENDPOINT_COMPOSED_V0_1</code></li>
            <li><code>route_modeling_status = NOT_MODELED</code></li>
            <li>Direct evidence is disclosed as AVAILABLE or NO_DIRECT_BILATERAL_EVIDENCE.</li>
            <li>No direct bilateral evidence is never interpreted as low risk.</li>
            <li>This is not full route, vessel, counterparty, correspondent-bank or logistics-path modelling.</li>
          </ul>
        </article>
      </section>

      <section className="mt-14 grid gap-8 lg:grid-cols-[0.85fr_1.15fr]">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Signed decision context</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight">A Risk Object should explain itself.</h2>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            In a technical pilot, Geomacro combines the current risk state with evidence, confidence, freshness, methodology and integrity information so software can inspect what it received before applying customer policy.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {RISK_OBJECT_FIELDS.map(([title, text]) => (
            <div key={title} className="rounded-xl border border-border/70 bg-card/45 p-4">
              <h3 className="text-sm font-semibold text-foreground">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-14 rounded-2xl border border-border/70 bg-card/50 p-6 sm:p-8">
        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Commercial and execution boundary</p>
            <h2 className="mt-3 text-2xl font-semibold">Evidence first. Customer control always.</h2>
          </div>
          <ul className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> Structural evidence remains <code>EVIDENCE_ONLY_NOT_IN_GRI_V1_2</code>.</li>
            <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> Review-gated or commercially unverified sources stay outside paid delivery.</li>
            <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> The private raw historical warehouse is not a customer-facing interface.</li>
            <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> Risk Gate returns context and recommendation; <code>execution_authorized=false</code>.</li>
          </ul>
        </div>
      </section>

      <section className="mt-14 grid gap-5 md:grid-cols-2">
        <article className="rounded-2xl border border-border/70 bg-card/50 p-6">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h2 className="mt-3 text-xl font-semibold">Current scope boundaries</h2>
          <ul className="mt-4 space-y-2 text-sm leading-relaxed text-muted-foreground">
            <li>Public Agent v1 is a grounded read layer, not autonomous execution.</li>
            <li>Structural payloads and Risk Gate remain controlled Founding Pilot capabilities.</li>
            <li>Current governed structural serving layer is historical geopolitical evidence.</li>
            <li>Additional structural dimensions require separate source-rights and serving validation.</li>
          </ul>
        </article>
        <article className="rounded-2xl border border-border/70 bg-card/50 p-6">
          <LockKeyhole className="h-5 w-5 text-primary" />
          <h2 className="mt-3 text-xl font-semibold">What Geomacro does not claim</h2>
          <ul className="mt-4 space-y-2 text-sm leading-relaxed text-muted-foreground">
            <li>No custody or signing of customer wallet transactions.</li>
            <li>No replacement for sanctions/compliance screening or customer approvals.</li>
            <li>No structural score or hidden structural weighting inside GRI/GRO.</li>
            <li>No enterprise SLA or third-party certification unless separately obtained.</li>
          </ul>
        </article>
      </section>

      <section className="mt-14 border-t border-border/60 pt-8">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-xl font-semibold">Have one real country, corridor or agent workflow?</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Start with the public Agent. If the workflow needs structural context, signed data or a policy recommendation, scope a 30-day Founding Pilot.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-3">
            <Button asChild><Link to="/contact">Discuss a pilot</Link></Button>
            <Button asChild variant="outline"><Link to="/risk-gate">See Risk Gate</Link></Button>
          </div>
        </div>
      </section>
    </main>
  );
}
