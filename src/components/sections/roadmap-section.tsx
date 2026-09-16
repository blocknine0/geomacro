import { CheckCircle2, CircleDot, FlaskConical } from "lucide-react";

const PHASES = [
  {
    status: "SHIPPED",
    tone: "text-emerald-300",
    title: "Public intelligence foundation",
    body: "Live event intelligence, separate geopolitical, macroeconomic and critical-mineral Risk Indices, Ask Geomacro, explainable drivers, evidence/confidence surfaces and audited GRI v1.2 proof lineage.",
    items: ["Live intelligence", "Separate Risk Indices", "Ask Geomacro", "GRI v1.2 proof lineage", "Change attribution"],
  },
  {
    status: "IN PROGRESS",
    tone: "text-amber-300",
    title: "Commercial hardening + pre-launch machine access",
    body: "Harden professional subscriptions, governed API delivery, signed Risk Objects, Risk Gate, source-rights controls, security evidence and the prepared pay-per-call agent path without enabling production funds.",
    items: ["Professional access model", "Risk Gate Private Pilot", "Commercial source rights", "Security & resilience", "x402/mainnet pre-launch lock"],
  },
  {
    status: "NEXT",
    tone: "text-sky-300",
    title: "Coordinated commercial launch",
    body: "Launch only after production credentials, deployment evidence, source-rights and security gates are complete. Public research remains free while approved professional plans, API access and pay-per-call agent intelligence move into a verified commercial state.",
    items: ["Design partners", "First paid pilot", "Capped real-USDC smoke purchase", "Marketplace listings", "Subscription activation"],
  },
  {
    status: "LATER",
    tone: "text-muted-foreground",
    title: "Production expansion",
    body: "Expand governed coverage, enterprise controls, contractual service commitments, professional workflow features and additional machine distribution only after operational evidence and customer validation support them.",
    items: ["Production operations", "Broader governed coverage", "Enterprise workflows", "Additional marketplaces", "Controlled mainnet integrations"],
  },
] as const;

export function RoadmapSection() {
  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="max-w-4xl">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Current roadmap</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">From free public intelligence to controlled commercial infrastructure.</h1>
        <p className="mt-5 max-w-3xl text-lg leading-relaxed text-muted-foreground">
          Geomacro keeps public research useful while commercial access becomes progressively more governed: professional depth for people, structured API/Risk Gate for teams, and pay-per-call intelligence for AI agents. Production funds are not enabled merely because the code path exists.
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

      <div className="mt-10 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border/70 bg-card/40 p-6 text-sm leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">Commercial launch gate:</span> source-rights review, security/resilience evidence, critical/high remediation, production database controls, provider credentials, exact deployment commit and explicit coordinated-launch authorization must all be satisfied before real-money machine access is enabled.
        </div>
        <div className="rounded-2xl border border-border/70 bg-card/40 p-6 text-sm leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">What launch does not change:</span> Geomacro remains a risk-intelligence provider. Risk Gate stays non-authorizing with <code>execution_authorized=false</code>, and customer identity, permissions, policy, funds and downstream execution remain customer-controlled.
        </div>
      </div>
    </section>
  );
}
