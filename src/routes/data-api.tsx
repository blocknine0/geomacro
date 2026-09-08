import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Braces,
  CheckCircle2,
  Database,
  FileCheck2,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const TITLE = "Data & API · Geomacro";
const DESCRIPTION =
  "Structured geopolitical and macro risk data, signed Risk Objects and Private Pilot Risk API access for professional and machine workflows.";

const CONTRACT_FIELDS = [
  ["Subject", "Country or directional corridor in the current Private Pilot."],
  ["Risk state", "Current score/state plus previous state and quantified delta where available."],
  ["Attribution", "Drivers and contribution context explaining material movement."],
  ["Evidence", "Evidence references, coverage and provenance information permitted for delivery."],
  ["Confidence & freshness", "Confidence, generated time, expiry/freshness and degraded-state context."],
  ["Methodology", "Versioned schema/methodology identifiers and integrity information."],
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
        <Badge variant="outline" className="font-mono text-[11px]">PUBLIC + PRIVATE PILOT</Badge>
        <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl">Risk intelligence as structured data.</h1>
        <p className="mt-5 max-w-3xl text-lg leading-relaxed text-muted-foreground">
          Use Geomacro's public intelligence and GRI transparency today, or work with the Private Pilot for signed country and directional-corridor Risk Objects, Risk Gate evaluation and scoped institutional delivery.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild size="lg" className="gap-2"><Link to="/contact">Request Private Pilot access <ArrowRight className="h-4 w-4" /></Link></Button>
          <Button asChild size="lg" variant="outline"><Link to="/docs">Read technical documentation</Link></Button>
        </div>
      </section>

      <section className="mt-14">
        <div className="max-w-3xl">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Availability</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight">Know exactly what is live, pilot-only or still a product direction.</h2>
        </div>
        <div className="mt-7 grid gap-5 lg:grid-cols-3">
          <article className="rounded-2xl border border-border/70 bg-card/50 p-6">
            <Database className="h-5 w-5 text-primary" />
            <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.16em] text-primary">LIVE · PUBLIC</p>
            <h3 className="mt-2 text-xl font-semibold">Public intelligence</h3>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Live risk intelligence, the Global Risk Index, selected evidence/confidence context, Ask Geomacro and public methodology surfaces.
            </p>
            <Button asChild variant="link" className="mt-4 h-auto p-0"><Link to="/intelligence">Explore intelligence <ArrowRight className="ml-1 h-4 w-4" /></Link></Button>
          </article>

          <article className="rounded-2xl border border-primary/25 bg-primary/[0.04] p-6">
            <Braces className="h-5 w-5 text-primary" />
            <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.16em] text-primary">PRIVATE PILOT</p>
            <h3 className="mt-2 text-xl font-semibold">Risk API + Risk Gate</h3>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Authenticated country and directional-corridor requests, signed Risk Objects, policy-ready outputs, rate limiting and immutable decision-audit infrastructure.
            </p>
            <Button asChild variant="link" className="mt-4 h-auto p-0"><Link to="/risk-gate">See Risk Gate <ArrowRight className="ml-1 h-4 w-4" /></Link></Button>
          </article>

          <article className="rounded-2xl border border-border/70 bg-card/50 p-6">
            <FileCheck2 className="h-5 w-5 text-primary" />
            <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">COMMERCIAL DIRECTION</p>
            <h3 className="mt-2 text-xl font-semibold">Professional workflows</h3>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Deeper history, alerts, exports, team workflows and broader monitoring belong to the professional product direction and must only be represented as live when each capability is actually released.
            </p>
            <Button asChild variant="link" className="mt-4 h-auto p-0"><Link to="/institutional">Institutional use cases <ArrowRight className="ml-1 h-4 w-4" /></Link></Button>
          </article>
        </div>
      </section>

      <section className="mt-14 grid gap-8 lg:grid-cols-[0.85fr_1.15fr]">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Machine-readable contract</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight">More than a naked score.</h2>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            The Geomacro Risk Object is designed to carry enough context for a downstream analyst or system to inspect what the risk refers to, what changed, why it changed and whether the object is fresh and verifiable.
          </p>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            The exact canonical schema is defined by versioned code contracts. The descriptions here explain the product concept and do not override the implemented Private Pilot schema.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {CONTRACT_FIELDS.map(([title, text]) => (
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
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Private Pilot controls</p>
            <h2 className="mt-3 text-2xl font-semibold">Built for scoped integration, not anonymous production access.</h2>
          </div>
          <ul className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> Authenticated external requests and per-client controls.</li>
            <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> Signed Risk Objects with issuer verification and fail-closed handling.</li>
            <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> Decision-audit records and explicit customer-policy separation.</li>
            <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> Geomacro returns risk context; the customer retains execution control.</li>
          </ul>
        </div>
      </section>

      <section className="mt-14 grid gap-5 md:grid-cols-2">
        <article className="rounded-2xl border border-border/70 bg-card/50 p-6">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h2 className="mt-3 text-xl font-semibold">Current scope boundaries</h2>
          <ul className="mt-4 space-y-2 text-sm leading-relaxed text-muted-foreground">
            <li>Risk API / Risk Gate are Private Pilot, not a generally available production SLA.</li>
            <li>Current verified subject scope is country + directional endpoint-composed corridor.</li>
            <li>Corridor context is not full route, vessel, counterparty or logistics-path modelling.</li>
            <li>Commercial source eligibility remains a launch gate for paid delivery.</li>
          </ul>
        </article>
        <article className="rounded-2xl border border-border/70 bg-card/50 p-6">
          <LockKeyhole className="h-5 w-5 text-primary" />
          <h2 className="mt-3 text-xl font-semibold">What the API does not do</h2>
          <ul className="mt-4 space-y-2 text-sm leading-relaxed text-muted-foreground">
            <li>It does not custody funds or sign customer wallet transactions.</li>
            <li>It does not replace sanctions/compliance screening or customer approvals.</li>
            <li>It does not silently convert stale or unverifiable risk into a fresh `CONTINUE`.</li>
            <li>It does not make an external-security-certification claim.</li>
          </ul>
        </article>
      </section>

      <section className="mt-14 border-t border-border/60 pt-8">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-xl font-semibold">Need machine-readable risk context for a real workflow?</h2>
            <p className="mt-2 text-sm text-muted-foreground">Start with a narrow country or corridor Private Pilot and validate the decision contract against your existing process.</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-3">
            <Button asChild><Link to="/contact">Discuss a pilot</Link></Button>
            <Button asChild variant="outline"><Link to="/docs">Technical docs</Link></Button>
          </div>
        </div>
      </section>
    </main>
  );
}
