import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Clock3,
  Database,
  FileCheck2,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HotTopicsLive } from "@/components/home/hot-topics-live";

const CONTROLS = [
  {
    icon: Database,
    title: "Coverage is explicit",
    body: "Country and corridor delivery is determined from current governed data. Geomacro expands toward the maximum defensible sovereign coverage without lowering evidence, freshness or source-rights thresholds to inflate a country count.",
  },
  {
    icon: Clock3,
    title: "Freshness travels with the result",
    body: "Deliverable intelligence carries observation and retrieval timing, confidence, source provenance, methodology/version context and degraded-state information where applicable.",
  },
  {
    icon: FileCheck2,
    title: "Availability before payment",
    body: "Agent access checks whether the exact requested intelligence can be delivered before a payment challenge is issued. No payment is requested when required coverage is unavailable, stale or commercially ineligible.",
  },
  {
    icon: ShieldCheck,
    title: "Decision support, not execution authority",
    body: "Risk Gate returns bounded external risk context and a recommendation. Customer identity, permissions, policy, funds and any downstream action remain customer-controlled; execution_authorized=false.",
  },
] as const;

export function IndustryReadinessSection() {
  return (
    <section className="border-y border-border/60 bg-card/15">
      <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="grid gap-10 lg:grid-cols-[0.78fr_1.22fr] lg:gap-14">
          <div className="max-w-xl">
            <Badge
              variant="outline"
              className="border-primary/35 bg-primary/5 font-mono text-[10px] uppercase tracking-[0.16em] text-primary"
            >
              Coverage & delivery controls
            </Badge>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
              Know whether the intelligence is usable before a system relies on it.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              Geomacro treats data availability, freshness, source eligibility and delivery state as part of the product. Coverage is data-driven and auditable, not implied by a marketing country count.
            </p>

            <div className="mt-6 flex flex-wrap gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              <span className="rounded-full border border-border/70 px-3 py-1.5">AVAILABLE</span>
              <span className="rounded-full border border-border/70 px-3 py-1.5">UNAVAILABLE</span>
              <span className="rounded-full border border-border/70 px-3 py-1.5">NOT_CONFIGURED</span>
              <span className="rounded-full border border-border/70 px-3 py-1.5">INSUFFICIENT_COVERAGE</span>
            </div>

            <div className="mt-7 flex flex-wrap gap-3">
              <Button asChild className="gap-2">
                <Link to="/data-api">
                  Data & API controls <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/research">Research & methodology</Link>
              </Button>
              <Button asChild variant="ghost">
                <Link to="/about">About & Trust</Link>
              </Button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {CONTROLS.map(({ icon: Icon, title, body }) => (
              <article key={title} className="rounded-2xl border border-border/70 bg-background/45 p-5 sm:p-6">
                <Icon className="h-5 w-5 text-primary" />
                <h3 className="mt-4 text-lg font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="mt-8 grid gap-3 border-t border-border/60 pt-6 text-sm text-muted-foreground md:grid-cols-3">
          <p><span className="font-medium text-foreground">Public intelligence:</span> available without a wallet or machine payment.</p>
          <p><span className="font-medium text-foreground">Risk Gate:</span> controlled Private Pilot with fail-closed verification.</p>
          <p><span className="font-medium text-foreground">Paid agent access:</span> staged behind availability, entitlement and settlement controls; real-funds activation is a separate launch gate.</p>
        </div>

        <HotTopicsLive />
      </div>
    </section>
  );
}
