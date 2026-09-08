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
  "Use Geomacro's geopolitical and macro risk intelligence as structured data, including signed Risk Objects and controlled Private Pilot API access.";

const CONTRACT_FIELDS = [
  ["Subject", "Country or directional corridor in the current Private Pilot."],
  ["Risk state", "Current score or state, previous state and quantified change where available."],
  ["Attribution", "Drivers and contribution details that explain material movement."],
  ["Evidence", "Evidence references, coverage and provenance that can be delivered to the customer."],
  ["Confidence & freshness", "Confidence, generated time, expiry or freshness and degraded-state context."],
  ["Methodology", "Versioned schema and methodology identifiers plus integrity information."],
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
        <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl">Use Geomacro risk intelligence in your own systems.</h1>
        <p className="mt-5 max-w-3xl text-lg leading-relaxed text-muted-foreground">
          Public intelligence and GRI transparency are available now. Private Pilot access adds signed country and corridor Risk Objects, Risk Gate decisions and scoped institutional delivery.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild size="lg" className="gap-2"><Link to="/contact">Request Private Pilot access <ArrowRight className="h-4 w-4" /></Link></Button>
          <Button asChild size="lg" variant="outline"><Link to="/docs">Read technical documentation</Link></Button>
        </div>
      </section>

      <section className="mt-14">
        <div className="max-w-3xl">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Availability</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight">What is available now, and what is not.</h2>
        </div>
        <div className="mt-7 grid gap-5 lg:grid-cols-3">
          <article className="rounded-2xl border border-border/70 bg-card/50 p-6">
            <Database className="h-5 w-5 text-primary" />
            <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.16em] text-primary">LIVE · PUBLIC</p>
            <h3 className="mt-2 text-xl font-semibold">Public intelligence</h3>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Live risk intelligence, the Global Risk Index, selected evidence and confidence, Ask Geomacro and the public methodology.
            </p>
            <Button asChild variant="link" className="mt-4 h-auto p-0"><Link to="/intelligence">Explore intelligence <ArrowRight className="ml-1 h-4 w-4" /></Link></Button>
          </article>

          <article className="rounded-2xl border border-primary/25 bg-primary/[0.04] p-6">
            <Braces className="h-5 w-5 text-primary" />
            <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.16em] text-primary">PRIVATE PILOT</p>
            <h3 className="mt-2 text-xl font-semibold">Risk API + Risk Gate</h3>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Authenticated country and corridor requests, signed Risk Objects, policy outputs, per-client rate limits and decision audit records.
            </p>
            <Button asChild variant="link" className="mt-4 h-auto p-0"><Link to="/risk-gate">See Risk Gate <ArrowRight className="ml-1 h-4 w-4" /></Link></Button>
          </article>

          <article className="rounded-2xl border border-border/70 bg-card/50 p-6">
            <FileCheck2 className="h-5 w-5 text-primary" />
            <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">COMMERCIAL DIRECTION</p>
            <h3 className="mt-2 text-xl font-semibold">Professional workflows</h3>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Deeper history, alerts, exports, team workflows and broader monitoring are planned professional features. They are not part of the live product today.
            </p>
            <Button asChild variant="link" className="mt-4 h-auto p-0"><Link to="/institutional">Institutional use cases <ArrowRight className="ml-1 h-4 w-4" /></Link></Button>
          </article>
        </div>
      </section>

      <section className="mt-14 grid gap-8 lg:grid-cols-[0.85fr_1.15fr]">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Machine-readable contract</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight">A Risk Object should explain itself.</h2>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            A Geomacro Risk Object carries the subject, current risk, change, evidence, confidence, freshness and methodology details a person or system needs to inspect the result.
          </p>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            The versioned code contract remains the source of truth for the exact schema. This page explains the product in plain language.
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
            <h2 className="mt-3 text-2xl font-semibold">Pilot access is scoped and authenticated.</h2>
          </div>
          <ul className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> Authenticated external requests and per-client controls.</li>
            <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> Signed Risk Objects with issuer verification and fail-closed handling.</li>
            <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> Decision-audit records and clear separation from the customer's own policy and approvals.</li>
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
            <li>It does not claim an external security certification.</li>
          </ul>
        </article>
      </section>

      <section className="mt-14 border-t border-border/60 pt-8">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-xl font-semibold">Need structured risk data for a real workflow?</h2>
            <p className="mt-2 text-sm text-muted-foreground">Start with one country or corridor use case and test the Private Pilot against the process you already use.</p>
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
