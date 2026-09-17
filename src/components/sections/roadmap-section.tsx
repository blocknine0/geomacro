import { CheckCircle2, CircleDot, FlaskConical } from "lucide-react";

const PHASES = [
  {
    status: "LIVE NOW",
    tone: "text-emerald-300",
    title: "Public risk intelligence",
    body: "These are the product surfaces a visitor can use today without treating roadmap work as already launched.",
    items: [
      "Live event intelligence",
      "Separate geopolitical, macroeconomic and critical-mineral Risk Indices",
      "Ask Geomacro",
      "Evidence, confidence and change attribution",
      "Public research and methodology",
    ],
  },
  {
    status: "ROADMAP · IN PROGRESS",
    tone: "text-amber-300",
    title: "Commercial hardening",
    body: "These capabilities are being hardened for controlled commercial use. They are not presented as generally available production services yet.",
    items: [
      "Risk Gate Private Pilot",
      "Signed Risk Objects",
      "Commercial API delivery",
      "Source-rights controls",
      "Security and resilience evidence",
      "Website and repository source of truth",
    ],
  },
  {
    status: "ROADMAP · NEXT",
    tone: "text-sky-300",
    title: "Institutional Early Access",
    body: "Controlled design-partner pilots will validate usefulness, integration fit, operational friction and willingness to pay before broader commercial availability.",
    items: [
      "Design partners",
      "Scoped staging evidence",
      "Pilot package and terms",
      "Buyer onboarding workflow",
      "First paid pilot",
    ],
  },
  {
    status: "ROADMAP · LATER",
    tone: "text-muted-foreground",
    title: "Production expansion",
    body: "Broader production availability comes only after security, reliability, legal, source-rights and customer-validation gates are met.",
    items: [
      "Production operations",
      "Broader governed coverage",
      "Enterprise controls and service commitments",
      "Scaled institutional workflows",
      "Controlled mainnet integrations",
      "Production agent commerce",
    ],
  },
] as const;

export function RoadmapSection() {
  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="max-w-4xl">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Live product + roadmap</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
          What works today, and what comes next.
        </h1>
        <p className="mt-5 max-w-3xl text-lg leading-relaxed text-muted-foreground">
          Geomacro separates currently usable product surfaces from planned or gated commercial capabilities. Nothing in the roadmap should be read as already launched, generally available, production-ready or covered by a service commitment.
        </p>
      </div>

      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        <StatusCard label="Use today" value="Public intelligence, Risk Indices, Ask Geomacro" />
        <StatusCard label="Controlled roadmap" value="Risk Gate, signed Risk Objects, commercial API" />
        <StatusCard label="Later production" value="Enterprise scale, mainnet and autonomous commerce" />
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
        <span className="font-medium text-foreground">Commercial availability boundary:</span> Risk Gate, signed Risk Objects and commercial API delivery remain roadmap / controlled Private Pilot capabilities. Broader Early Access remains conditional on scoped security and resilience validation, remediation of critical/high findings, source-rights review for paid delivery, controlled staging evidence and an agreed customer-use boundary. Mainnet, real-money agent commerce, production SLAs and autonomous execution are not live.
      </div>
    </section>
  );
}

function StatusCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-card/35 p-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-sm leading-relaxed text-foreground">{value}</p>
    </div>
  );
}
