import { CheckCircle2, CircleDot, FlaskConical } from "lucide-react";

const PHASES = [
  {
    status: "LIVE NOW",
    tone: "text-emerald-300",
    title: "Public risk intelligence",
    body: "These are the product surfaces visitors can use today with explicit evidence and availability boundaries.",
    items: [
      "Live event intelligence",
      "Separate geopolitical, macroeconomic and critical-mineral Risk Indices",
      "Ask Geomacro",
      "Evidence, confidence and change attribution",
      "Public research and methodology",
    ],
  },
  {
    status: "CONTROLLED COMMERCIAL",
    tone: "text-amber-300",
    title: "Governed machine delivery",
    body: "These capabilities are implemented behind controlled entitlements, Private Pilot scope and runtime-authoritative availability checks.",
    items: [
      "Risk Gate Private Pilot",
      "Signed Risk Objects",
      "Commercial API delivery",
      "Source-rights controls",
      "Security and resilience evidence",
      "Machine-payment runtime gates",
    ],
  },
  {
    status: "EXPANSION",
    tone: "text-sky-300",
    title: "Institutional deployment",
    body: "Controlled design-partner and institutional deployments validate integration fit, operational requirements and service scope before wider availability.",
    items: [
      "Design partners",
      "Scoped deployment evidence",
      "Commercial package and terms",
      "Buyer onboarding workflow",
      "Institutional integrations",
    ],
  },
  {
    status: "SCALE",
    tone: "text-muted-foreground",
    title: "Production expansion",
    body: "Broader availability expands only when security, reliability, legal, source-rights and customer-specific operating gates are satisfied.",
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
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Live product + expansion plan</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
          What works today, and how production expands.
        </h1>
        <p className="mt-5 max-w-3xl text-lg leading-relaxed text-muted-foreground">
          Geomacro separates live public intelligence, controlled commercial capabilities and future scale-out work. Runtime contracts, entitlements and evidence determine what is available for any specific machine or institutional request.
        </p>
      </div>

      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        <StatusCard label="Live public product" value="Risk Intelligence, Risk Indices, Ask Geomacro" />
        <StatusCard label="Controlled commercial" value="Risk Gate, signed Risk Objects, commercial API" />
        <StatusCard label="Production scale" value="Enterprise operations, governed coverage and runtime-gated commerce" />
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
        <span className="font-medium text-foreground">Availability boundary:</span> Risk Gate, signed Risk Objects and commercial API delivery remain controlled Private Pilot or entitlement-scoped capabilities. Payment and mainnet integrations are shown as active only when the corresponding live runtime contract confirms that state. Geomacro does not convert a configured integration into a production-availability claim.
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
