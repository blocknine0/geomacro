import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Bot,
  Braces,
  Building2,
  CheckCircle2,
  FileSearch,
  GitBranch,
  Radio,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AskGeomacroSection } from "@/components/home/ask-geomacro";
import { GlobalRiskIndexSection } from "@/components/home/gri-section";
import { useGlobalRisk } from "@/lib/use-global-risk";
import { GRI_METHOD_VERSION } from "@/lib/gri-current-contract";

const FLOW = [
  ["1", "Observe", "Live geopolitical and macro developments enter the evidence pipeline."],
  ["2", "Structure", "Events are classified, deduplicated and converted into comparable risk signals."],
  ["3", "Score & attribute", "The Global Risk Index publishes a versioned score and explains what moved it."],
  ["4", "Deliver decision context", "Humans, APIs and agents can consume evidence, confidence and policy-ready risk context."],
] as const;

const PRODUCT_CARDS = [
  {
    icon: Radio,
    status: "LIVE",
    title: "Risk Intelligence",
    body: "Follow current geopolitical and macro developments with severity, confidence, evidence and structured context.",
    to: "/intelligence" as const,
    cta: "Explore intelligence",
  },
  {
    icon: ShieldCheck,
    status: "PRIVATE PILOT",
    title: "Risk Gate",
    body: "Evaluate country and corridor risk before a financial workflow proceeds, then return a machine-readable policy recommendation.",
    to: "/risk-gate" as const,
    cta: "See Risk Gate",
  },
  {
    icon: Braces,
    status: "PUBLIC + PRIVATE PILOT",
    title: "Data & API",
    body: "Use public intelligence today and request scoped API access for signed Risk Objects and machine workflows.",
    to: "/data-api" as const,
    cta: "View data access",
  },
] as const;

export function CommercialHome() {
  const risk = useGlobalRisk();

  return (
    <>
      <section className="mx-auto w-full max-w-7xl px-4 pb-10 pt-10 sm:px-6 sm:pt-14 lg:pb-14 lg:pt-16">
        <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)] lg:gap-14">
          <div className="min-w-0">
            <Badge
              variant="outline"
              className="gap-2 border-primary/40 bg-primary/5 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.12em] text-primary"
            >
              <Radio className="h-3 w-3" /> Live geopolitical + macro risk intelligence
            </Badge>
            <h1 className="mt-6 max-w-4xl text-[clamp(2.4rem,6vw,5.5rem)] font-semibold leading-[0.98] tracking-tight">
              Know what changed. <span className="text-primary">Know why it matters.</span>
            </h1>
            <p className="mt-6 max-w-3xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
              Geomacro turns global geopolitical and macro events into explainable risk scores, evidence, confidence and machine-readable decision context for professionals and automated financial systems.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="gap-2">
                <Link to="/intelligence">Explore intelligence <ArrowRight className="h-4 w-4" /></Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/ask-geomacro">Ask Geomacro</Link>
              </Button>
              <Button asChild size="lg" variant="ghost">
                <Link to="/risk-gate">See Risk Gate</Link>
              </Button>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              Public intelligence does not require a wallet. Arc, Circle and prediction-market functionality remain secondary technical-proof layers.
            </p>
          </div>

          <div className="rounded-2xl border border-border/70 bg-card/55 p-6 backdrop-blur-sm sm:p-7">
            <div className="flex items-center justify-between gap-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">How Geomacro works</p>
              <span className="font-mono text-[10px] text-muted-foreground">{GRI_METHOD_VERSION}</span>
            </div>
            <ol className="mt-6 space-y-5">
              {FLOW.map(([step, title, body]) => (
                <li key={step} className="grid grid-cols-[32px_minmax(0,1fr)] gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full border border-primary/30 bg-primary/10 font-mono text-xs text-primary">
                    {step}
                  </span>
                  <div>
                    <p className="font-medium text-foreground">{title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <GlobalRiskIndexSection
        risk={risk.data}
        status={risk.status}
        error={risk.error}
        updatedAt={risk.updatedAt}
        retry={risk.retry}
      />

      <AskGeomacroSection />

      <section className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="max-w-3xl">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Product surfaces</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">From risk intelligence to decision infrastructure.</h2>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            Geomacro separates the public intelligence layer from Private Pilot machine delivery and secondary onchain applications, so every capability is represented at its actual stage.
          </p>
        </div>
        <div className="mt-8 grid gap-5 lg:grid-cols-3">
          {PRODUCT_CARDS.map(({ icon: Icon, status, title, body, to, cta }) => (
            <article key={title} className="flex min-h-[260px] flex-col rounded-2xl border border-border/70 bg-card/50 p-6">
              <div className="flex items-center justify-between gap-3">
                <Icon className="h-5 w-5 text-primary" />
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{status}</span>
              </div>
              <h3 className="mt-5 text-xl font-semibold">{title}</h3>
              <p className="mt-3 flex-1 text-sm leading-relaxed text-muted-foreground">{body}</p>
              <Button asChild variant="link" className="mt-5 h-auto justify-start p-0">
                <Link to={to}>{cta} <ArrowRight className="ml-1 h-4 w-4" /></Link>
              </Button>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-border/60 bg-card/20">
        <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Risk Gate</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">External risk context before an action proceeds.</h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              A treasury system or financial agent can submit a country or corridor context, combine Geomacro's signed risk object with its own policy and receive a recommendation before execution.
            </p>
            <Button asChild className="mt-6 gap-2"><Link to="/risk-gate">Open Risk Gate overview <ArrowRight className="h-4 w-4" /></Link></Button>
          </div>
          <div className="rounded-2xl border border-border/70 bg-background/40 p-6">
            <div className="font-mono text-xs text-muted-foreground">Example control flow</div>
            <div className="mt-5 space-y-3 text-sm">
              {[
                "Financial action requested",
                "Country / corridor Risk Object evaluated",
                "Evidence, confidence and freshness checked",
                "Customer policy applied",
                "REQUIRE_APPROVAL returned to customer system",
              ].map((text) => (
                <div key={text} className="flex items-center gap-3 rounded-xl border border-border/60 bg-card/40 px-4 py-3">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" /> {text}
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
              Geomacro does not autonomously execute or authorize the customer's transaction. Risk Gate is currently a Private Pilot.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-7xl gap-5 px-4 py-12 sm:px-6 sm:py-16 md:grid-cols-3">
        <Link to="/institutional" className="group rounded-2xl border border-border/70 bg-card/50 p-6 transition hover:border-primary/40">
          <Building2 className="h-5 w-5 text-primary" />
          <h2 className="mt-4 text-xl font-semibold">For institutions</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Treasury, payments, strategy, risk, supply-chain and institutional workflows.</p>
          <span className="mt-5 inline-flex items-center text-sm text-primary">Explore use cases <ArrowRight className="ml-1 h-4 w-4 transition group-hover:translate-x-0.5" /></span>
        </Link>
        <Link to="/research" className="group rounded-2xl border border-border/70 bg-card/50 p-6 transition hover:border-primary/40">
          <FileSearch className="h-5 w-5 text-primary" />
          <h2 className="mt-4 text-xl font-semibold">Research & methodology</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Inspect methodology, change attribution, evidence and current limitations.</p>
          <span className="mt-5 inline-flex items-center text-sm text-primary">Review methodology <ArrowRight className="ml-1 h-4 w-4 transition group-hover:translate-x-0.5" /></span>
        </Link>
        <Link to="/data-api" className="group rounded-2xl border border-border/70 bg-card/50 p-6 transition hover:border-primary/40">
          <Bot className="h-5 w-5 text-primary" />
          <h2 className="mt-4 text-xl font-semibold">For machine workflows</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Structured Risk Objects and policy-ready context for APIs and autonomous systems.</p>
          <span className="mt-5 inline-flex items-center text-sm text-primary">View machine access <ArrowRight className="ml-1 h-4 w-4 transition group-hover:translate-x-0.5" /></span>
        </Link>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 pb-14 sm:px-6 sm:pb-18">
        <div className="rounded-2xl border border-border/70 bg-card/45 p-6 sm:p-8">
          <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">Secondary technical proof</p>
              <h2 className="mt-3 text-2xl font-semibold">Arc, Circle and prediction-market implementation remain accessible.</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                These surfaces demonstrate programmable-finance and testnet implementation. They are not the primary commercial identity of Geomacro.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Button asChild variant="outline"><Link to="/arena">Prediction Markets</Link></Button>
              <Button asChild variant="outline"><Link to="/onchain">Arc / Onchain</Link></Button>
              <Button asChild variant="outline"><Link to="/bridge-swap">Bridge & Swap</Link></Button>
              <Button asChild variant="outline"><Link to="/pipeline"><GitBranch className="mr-2 h-4 w-4" />Data Pipeline</Link></Button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
