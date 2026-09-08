import { CheckCircle2, CircleDot, FlaskConical } from "lucide-react";

const PHASES = [
  {
    status: "SHIPPED",
    tone: "text-emerald-300",
    title: "Intelligence foundation",
    body: "Live event intelligence, versioned Global Risk Index, explainable drivers, evidence/confidence surfaces and Arc/Circle technical proof.",
    items: ["Live intelligence", "GRI v1.2", "Change attribution", "Arc Testnet technical proof"],
  },
  {
    status: "IN PROGRESS",
    tone: "text-amber-300",
    title: "Commercial hardening",
    body: "Turn the working system into a defensible Private Pilot with source-rights controls, signed Risk Objects, Risk Gate, security evidence and reproducible CI.",
    items: ["Risk Gate Private Pilot", "Commercial source rights", "Security & resilience", "Website / repo source of truth"],
  },
  {
    status: "NEXT",
    tone: "text-sky-300",
    title: "Institutional Early Access",
    body: "Run controlled pilots with financial, treasury, payments, risk and agent teams. Validate decision usefulness, integration requirements and willingness to pay.",
    items: ["Design partners", "Staging load evidence", "Pilot package & pricing", "First paid pilot"],
  },
  {
    status: "LATER",
    tone: "text-muted-foreground",
    title: "Production expansion",
    body: "Expand coverage, enterprise controls and programmable integrations only after security, reliability, legal and customer validation gates are met.",
    items: ["Production SLA", "Broader data coverage", "Enterprise workflows", "Controlled mainnet integrations"],
  },
] as const;

export function RoadmapSection() {
  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="max-w-4xl">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Current roadmap</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">From working intelligence to trusted commercial infrastructure.</h1>
        <p className="mt-5 max-w-3xl text-lg leading-relaxed text-muted-foreground">
          Geomacro prioritizes reliability, explainability, security and real customer validation before broader production expansion. The roadmap reflects current product gates rather than a feature wishlist.
        </p>
      </div>

      <div className="mt-12 grid gap-5 lg:grid-cols-2">
        {PHASES.map((phase, index) => (
          <article key={phase.title} className="rounded-2xl border border-border/70 bg-card/50 p-6 sm:p-7">
            <div className="flex items-center justify-between gap-4">
              <span className={`font-mono text-[10px] uppercase tracking-[0.16em] ${phase.tone}`}>{phase.status}</span>
              {index === 0 ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-300" />
              ) : index === 1 ? (
                <CircleDot className="h-5 w-5 text-amber-300" />
              ) : (
                <FlaskConical className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            <h2 className="mt-4 text-2xl font-semibold">{phase.title}</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{phase.body}</p>
            <div className="mt-5 flex flex-wrap gap-2 border-t border-border/50 pt-4">
              {phase.items.map((item) => (
                <span key={item} className="rounded-full border border-border/70 bg-background/30 px-3 py-1.5 text-xs text-muted-foreground">
                  {item}
                </span>
              ))}
            </div>
          </article>
        ))}
      </div>

      <div className="mt-10 rounded-2xl border border-border/70 bg-card/40 p-6 text-sm leading-relaxed text-muted-foreground">
        <span className="font-medium text-foreground">Launch gate:</span> Early Access remains conditional on scoped security/resilience validation, remediation of critical/high findings, source-rights review for paid delivery and a controlled staging test. Full production launch requires a broader readiness review.
      </div>
    </section>
  );
}
