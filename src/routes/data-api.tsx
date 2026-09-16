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

const TITLE = "Governed Risk Data, API & Agent Access · Geomacro";
const DESCRIPTION =
  "Evaluate Geomacro's governed geopolitical, macroeconomic and critical-mineral risk data, commercial structured API, signed Risk Objects and Risk Gate Private Pilot.";
const URL = "https://geomacro.live/data-api";
const IMAGE = "https://geomacro.live/og-image-v2.png";

const RISK_OBJECT_FIELDS = [
  ["Subject", "Country or directional corridor in the current controlled scope."],
  ["Risk state", "Current score or state, previous state and quantified change where available."],
  ["Attribution", "Drivers and contribution details that explain material movement."],
  ["Evidence", "Eligible evidence references, coverage and provenance that can be delivered to the customer."],
  ["Confidence & freshness", "Confidence, generated time, expiry/freshness and degraded-state context."],
  ["Methodology", "Versioned schema and methodology identifiers plus integrity information."],
] as const;

const STRUCTURAL_FIELDS = [
  ["Observation", "Dimension, metric, numeric/text value, unit and observation time."],
  ["Geography", "Country ISO3 and partner-country ISO3 when an eligible bilateral record exists."],
  ["Provenance", "Commercially eligible source metadata, parser version and retrieval time."],
  ["Integrity", "Quality/methodology status and normalized content hash."],
  ["Coverage", "Source, dimension, coverage year, observation count and latest observed time."],
  ["Missing data", "Explicit AVAILABLE, UNAVAILABLE or NOT_CONFIGURED state. Missing is never converted to zero risk."],
] as const;

export const Route = createFileRoute("/data-api")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { name: "robots", content: "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: URL },
      { property: "og:image", content: IMAGE },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
    ],
    links: [{ rel: "canonical", href: URL }],
  }),
  component: DataApiPage,
});

function DataApiPage() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
      <section className="max-w-4xl">
        <Badge variant="outline" className="font-mono text-[11px]">
          GOVERNED DATA · PAID API · AGENT ACCESS
        </Badge>
        <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl">
          Use Geomacro risk intelligence inside your own workflow.
        </h1>
        <p className="mt-5 max-w-3xl text-lg leading-relaxed text-muted-foreground">
          Public Risk Intelligence and Risk Indices can be evaluated on the website. Teams that need governed machine-readable delivery can scope a commercial Private Pilot for structured country/corridor data, signed Risk Objects and Risk Gate outputs.
        </p>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Free Explorer is website/dashboard access, not a free API. Commercial delivery is entitlement-controlled, source-rights-aware and bounded to the exact capability and subject scope agreed for the pilot.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild size="lg" className="gap-2">
            <Link to="/contact">Request a Founding Pilot <ArrowRight className="h-4 w-4" /></Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/docs">Read technical documentation</Link>
          </Button>
        </div>
      </section>

      <section className="mt-14 grid gap-5 md:grid-cols-3">
        <article className="rounded-2xl border border-border/70 bg-card/50 p-6">
          <Database className="h-5 w-5 text-primary" />
          <h2 className="mt-3 text-xl font-semibold">Governed data</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Receive only commercially eligible observations and provenance allowed by the customer's entitlement. Missing data remains explicit rather than becoming a fabricated score.
          </p>
        </article>
        <article className="rounded-2xl border border-border/70 bg-card/50 p-6">
          <Braces className="h-5 w-5 text-primary" />
          <h2 className="mt-3 text-xl font-semibold">Structured API</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Machine-readable country/corridor digests and profiles can support internal research, monitoring and application workflows under an active commercial entitlement.
          </p>
        </article>
        <article className="rounded-2xl border border-border/70 bg-card/50 p-6">
          <Bot className="h-5 w-5 text-primary" />
          <h2 className="mt-3 text-xl font-semibold">Risk Objects & Risk Gate</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Signed decision context can carry evidence, confidence, freshness and integrity into a customer-controlled policy workflow. Geomacro does not authorize execution.
          </p>
        </article>
      </section>

      <section className="mt-14 rounded-2xl border border-primary/25 bg-primary/[0.04] p-6 sm:p-8">
        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">COMMERCIAL MACHINE ACCESS</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">Entitlement defines the product, not the payment rail.</h2>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              A subscription, invoice or verified machine payment maps to a canonical Geomacro entitlement. That entitlement decides the capability, subject type, history depth and response limits. A provider or payment method cannot widen the payload.
            </p>
          </div>
          <div className="rounded-xl border border-border/70 bg-background/60 p-5">
            <p className="font-mono text-xs text-muted-foreground">Paid structured endpoint</p>
            <code className="mt-2 block break-all rounded-md bg-muted/50 p-3 text-xs">
              POST https://geomacro.live/api/commercial/structural
            </code>
            <p className="mt-5 font-mono text-xs text-muted-foreground">Example request</p>
            <pre className="mt-2 overflow-x-auto rounded-md bg-muted/50 p-3 text-xs leading-relaxed">
{`{
  "request_id": "client-request-0001",
  "capability": "structural_country_profile",
  "subject": {
    "type": "country",
    "country_iso3": "IND"
  }
}`}
            </pre>
            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
              Machine discovery is available at <code>/.well-known/geomacro-agent.json</code>. Access to a discoverable route does not itself grant a commercial entitlement.
            </p>
          </div>
        </div>
      </section>

      <section className="mt-14">
        <div className="max-w-3xl">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Access model</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight">A clear boundary between evaluation and commercial delivery.</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            These are current access boundaries, not a promise of self-serve enterprise availability. Pilot scope, permitted use, support, source rights and data handling must be agreed before sensitive or production-dependent workflows are introduced.
          </p>
        </div>

        <div className="mt-7 grid gap-5 lg:grid-cols-4">
          <article className="rounded-2xl border border-border/70 bg-card/50 p-6">
            <Database className="h-5 w-5 text-primary" />
            <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.16em] text-primary">PUBLIC · FREE</p>
            <h3 className="mt-2 text-xl font-semibold">Free Explorer</h3>
            <ul className="mt-4 space-y-2 text-sm leading-relaxed text-muted-foreground">
              <li>Public Risk Intelligence and selected event/evidence pages.</li>
              <li>Current public Risk Indices and methodology context.</li>
              <li>Approved public country/corridor views where available.</li>
              <li>No API credential or structured-data download.</li>
              <li>No signed Risk Object or Risk Gate entitlement.</li>
            </ul>
          </article>

          <article className="rounded-2xl border border-primary/25 bg-primary/[0.04] p-6">
            <FileCheck2 className="h-5 w-5 text-primary" />
            <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.16em] text-primary">FOUNDING ANALYST PILOT</p>
            <h3 className="mt-2 text-xl font-semibold">Professional intelligence</h3>
            <ul className="mt-4 space-y-2 text-sm leading-relaxed text-muted-foreground">
              <li>5,000 credits / 30 days.</li>
              <li>Deeper analytics, historical context and attribution.</li>
              <li>Governed country/corridor profile views.</li>
              <li>Agreed structured exports where scoped.</li>
              <li>No automatic API credential, Risk Object or Risk Gate.</li>
            </ul>
          </article>

          <article className="rounded-2xl border border-primary/25 bg-primary/[0.04] p-6">
            <Braces className="h-5 w-5 text-primary" />
            <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.16em] text-primary">FOUNDING API + RISK GATE PILOT</p>
            <h3 className="mt-2 text-xl font-semibold">Risk API + Risk Gate</h3>
            <ul className="mt-4 space-y-2 text-sm leading-relaxed text-muted-foreground">
              <li>20,000 credits / 30 days.</li>
              <li>Authenticated machine-readable governed data.</li>
              <li>Country/corridor digests and profiles.</li>
              <li>Signed Risk Objects and Risk Gate bundles.</li>
              <li>Controlled API/export access for an agreed workflow.</li>
            </ul>
          </article>

          <article className="rounded-2xl border border-border/70 bg-card/50 p-6">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">INSTITUTIONAL</p>
            <h3 className="mt-2 text-xl font-semibold">Contracted deployment</h3>
            <ul className="mt-4 space-y-2 text-sm leading-relaxed text-muted-foreground">
              <li>100,000-credit monthly starting pool, then contracted volume.</li>
              <li>Contracted countries, corridors and historical depth.</li>
              <li>Wider API volume, structured exports and monitoring cadence.</li>
              <li>Enterprise controls and support only where implemented and contracted.</li>
            </ul>
          </article>
        </div>
      </section>

      <section className="mt-14 grid gap-8 lg:grid-cols-2">
        <article className="rounded-2xl border border-border/70 bg-card/50 p-6 sm:p-8">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Country structural profile</p>
          <h2 className="mt-3 text-2xl font-semibold">Historical context without a fabricated structural score.</h2>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            Paid governed profiles can return commercially eligible structural observations, source/coverage metadata and integrity context within server-owned entitlement limits. Free Explorer does not receive the structured profile payload.
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
            Paid API workflows can combine the current risk state with evidence, confidence, freshness, methodology and integrity information so software can inspect what it received before applying customer policy.
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
            <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> Review-gated or commercially unverified sources stay outside customer delivery.</li>
            <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> Raw/private historical warehouse data is never a default customer-facing product.</li>
            <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> Risk Gate returns context and recommendation; <code>execution_authorized=false</code>.</li>
          </ul>
        </div>
      </section>

      <section className="mt-14 grid gap-5 md:grid-cols-2">
        <article className="rounded-2xl border border-border/70 bg-card/50 p-6">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h2 className="mt-3 text-xl font-semibold">Current scope boundaries</h2>
          <ul className="mt-4 space-y-2 text-sm leading-relaxed text-muted-foreground">
            <li>Free Explorer is website/dashboard access, not a free API.</li>
            <li>Commercial API access requires an active paid entitlement.</li>
            <li>One-shot machine payments unlock only the named bounded capability.</li>
            <li>Additional structural dimensions require separate source-rights and serving validation.</li>
          </ul>
        </article>
        <article className="rounded-2xl border border-border/70 bg-card/50 p-6">
          <LockKeyhole className="h-5 w-5 text-primary" />
          <h2 className="mt-3 text-xl font-semibold">What Geomacro does not claim</h2>
          <ul className="mt-4 space-y-2 text-sm leading-relaxed text-muted-foreground">
            <li>No custody or signing of customer wallet transactions.</li>
            <li>No replacement for sanctions/compliance screening or customer approvals.</li>
            <li>No hidden structural score or structural weighting inside the public Risk Indices or signed Risk Objects.</li>
            <li>No enterprise SLA or third-party certification unless separately obtained and documented.</li>
          </ul>
        </article>
      </section>

      <section className="mt-14 border-t border-border/60 pt-8">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-xl font-semibold">Have one real country, corridor or agent workflow?</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Use Free Explorer to evaluate the public intelligence product. If the workflow needs deeper history, structured API delivery, signed data or policy context, scope the appropriate commercial pilot.
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
