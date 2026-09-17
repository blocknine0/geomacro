import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Bot,
  Braces,
  Building2,
  CheckCircle2,
  Landmark,
  Radio,
  Route as RouteIcon,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AskGeomacroSection } from "@/components/home/ask-geomacro";
import { RiskIndicesSection } from "@/components/home/gri-section";
import { GRI_METHOD_VERSION } from "@/lib/gri-current-contract";

const FLOW = [
  ["1", "Watch", "Geomacro monitors geopolitical, macro and critical-mineral developments from governed sources."],
  ["2", "Verify", "Accepted developments are time-stamped, structured and linked back to their evidence."],
  ["3", "Explain", "Risk readings show what changed, why it changed and how confident the evidence is."],
  ["4", "Use", "People can review the result directly, while software can consume the same bounded risk context."],
] as const;

const PRODUCT_CARDS = [
  {
    icon: Radio,
    status: "LIVE",
    title: "Risk Intelligence",
    body: "See current geopolitical, macro and critical-mineral developments with severity, confidence and source evidence.",
    to: "/intelligence" as const,
    cta: "Explore live intelligence",
  },
  {
    icon: Bot,
    status: "LIVE",
    title: "Ask Geomacro",
    body: "Ask a risk question and get an answer grounded in Geomacro's recorded evidence and current risk data.",
    to: "/ask-geomacro" as const,
    cta: "Ask a risk question",
  },
  {
    icon: ShieldCheck,
    status: "PRIVATE PILOT",
    title: "Risk Gate",
    body: "Check country or corridor risk before a financial action moves forward. Geomacro returns context; the customer keeps control.",
    to: "/risk-gate" as const,
    cta: "See Risk Gate",
  },
  {
    icon: Braces,
    status: "PUBLIC + PILOT API",
    title: "Data & API",
    body: "Use public intelligence now, or test signed Risk Objects and Risk Gate outputs inside a controlled workflow.",
    to: "/data-api" as const,
    cta: "View data access",
  },
] as const;

const BUYER_USE_CASES = [
  {
    icon: Landmark,
    title: "Treasury & payments",
    body: "Add country and corridor risk context before releasing a cross-border payment, changing limits or escalating an approval.",
  },
  {
    icon: Building2,
    title: "Risk & strategy",
    body: "Track current risk, historical movement, evidence quality and exact change attribution in one reviewable workflow.",
  },
  {
    icon: RouteIcon,
    title: "Supply chain & commodities",
    body: "Monitor geopolitical, macro and critical-mineral developments that can affect sourcing, logistics and exposure decisions.",
  },
  {
    icon: Bot,
    title: "Software & agent systems",
    body: "Give automated financial workflows external risk context before the customer's own system decides whether to proceed.",
  },
] as const;

const QUESTIONS = [
  "Why did geopolitical risk move today?",
  "Which countries now need closer review?",
  "What evidence is driving the change?",
] as const;

export function CommercialHome() {
  return (
    <>
      <section className="mx-auto w-full max-w-7xl px-4 pb-10 pt-10 sm:px-6 sm:pt-14 lg:pb-16 lg:pt-16">
        <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)] lg:gap-14">
          <div className="min-w-0">
            <Badge variant="outline" className="gap-2 border-primary/40 bg-primary/5 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.12em] text-primary">
              <Radio className="h-3 w-3" /> Live geopolitical + macro + critical-mineral intelligence
            </Badge>
            <h1 className="mt-6 max-w-4xl text-[clamp(2.55rem,6vw,5.5rem)] font-semibold leading-[0.97] tracking-tight">
              See what changed in global risk. <span className="text-primary">Then see why.</span>
            </h1>
            <p className="mt-6 max-w-3xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
              Geomacro turns current geopolitical, macroeconomic and critical-mineral developments into explainable risk intelligence for treasury, risk, supply-chain and software teams.
            </p>
            <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              Every reading is designed to lead back to evidence, confidence and change attribution, so a score is not the end of the answer.
            </p>

            <div className="mt-6 grid max-w-3xl gap-2 sm:grid-cols-3">
              {QUESTIONS.map((question) => (
                <Link key={question} to="/ask-geomacro" className="group rounded-xl border border-border/70 bg-card/35 px-4 py-3 text-sm leading-relaxed transition hover:border-primary/40 hover:bg-card/60">
                  <span>{question}</span>
                  <ArrowRight className="mt-2 h-3.5 w-3.5 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
                </Link>
              ))}
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="gap-2">
                <Link to="/intelligence">Explore live intelligence <ArrowRight className="h-4 w-4" /></Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/global-risk">View Risk Indices</Link>
              </Button>
              <Button asChild size="lg" variant="ghost">
                <Link to="/institutional">For institutions</Link>
              </Button>
            </div>

            <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 font-mono text-[10px] uppercase tracking-[0.13em] text-muted-foreground">
              <span>Public intelligence · Live</span>
              <span>Risk Gate · Private Pilot</span>
              <span>Arc / Circle · Technical Proof</span>
            </div>
          </div>

          <div className="rounded-2xl border border-border/70 bg-card/55 p-6 backdrop-blur-sm sm:p-7">
            <div className="flex items-center justify-between gap-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">From event to decision context</p>
              <span className="font-mono text-[10px] text-muted-foreground">{GRI_METHOD_VERSION}</span>
            </div>
            <ol className="mt-6 space-y-5">
              {FLOW.map(([step, title, body]) => (
                <li key={step} className="grid grid-cols-[32px_minmax(0,1fr)] gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full border border-primary/30 bg-primary/10 font-mono text-xs text-primary">{step}</span>
                  <div>
                    <p className="font-medium text-foreground">{title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{body}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="mt-6 border-t border-border/60 pt-5">
              <p className="text-xs leading-relaxed text-muted-foreground">
                Geomacro provides external risk context. It does not custody funds, replace compliance screening or authorize customer transactions.
              </p>
            </div>
          </div>
        </div>
      </section>

      <RiskIndicesSection />

      <section className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="max-w-3xl">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">What you can do here</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Start with the question you need answered.</h2>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            Public intelligence and risk indices are live. Ask Geomacro is available now. Risk Gate and commercial API delivery remain controlled Private Pilot products.
          </p>
        </div>
        <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {PRODUCT_CARDS.map(({ icon: Icon, status, title, body, to, cta }) => (
            <article key={title} className="flex min-h-[250px] flex-col rounded-2xl border border-border/70 bg-card/50 p-6">
              <div className="flex items-center justify-between gap-3">
                <Icon className="h-5 w-5 text-primary" />
                <span className="font-mono text-[9px] uppercase tracking-[0.13em] text-muted-foreground">{status}</span>
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
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Risk Gate · Private Pilot</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">Check risk before the action, not after.</h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              A treasury system, payment workflow or agent sends the country or corridor context it needs checked. Risk Gate verifies the signed Risk Object and returns bounded external risk context and a recommendation. The customer's own policy still decides what happens next.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild className="gap-2"><Link to="/risk-gate">Open Risk Gate <ArrowRight className="h-4 w-4" /></Link></Button>
              <Button asChild variant="outline"><Link to="/contact">Discuss a Private Pilot</Link></Button>
            </div>
          </div>
          <div className="rounded-2xl border border-border/70 bg-background/40 p-6">
            <div className="font-mono text-xs text-muted-foreground">Current Private Pilot control flow</div>
            <div className="mt-5 space-y-3 text-sm">
              {[
                "Action submitted for review",
                "Country / corridor Risk Object verified",
                "Evidence, confidence and freshness checked",
                "Risk Gate recommendation returned",
                "Customer policy decides what happens next",
              ].map((text) => (
                <div key={text} className="flex items-start gap-3 rounded-xl border border-border/60 bg-card/40 px-4 py-3">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> {text}
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
              Geomacro does not authorize or execute the transaction. `execution_authorized` remains false.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="grid gap-10 lg:grid-cols-[0.75fr_1.25fr]">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Who Geomacro is for</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">Built for teams that already make risk-sensitive decisions.</h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              Geomacro adds a documented external-risk view to research, review, approval and monitoring workflows. It supports the decision; it does not replace the decision-maker.
            </p>
            <Button asChild variant="outline" className="mt-6 gap-2">
              <Link to="/institutional">Explore institutional workflows <ArrowRight className="h-4 w-4" /></Link>
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {BUYER_USE_CASES.map(({ icon: Icon, title, body }) => (
              <article key={title} className="rounded-2xl border border-border/70 bg-card/50 p-5">
                <Icon className="h-5 w-5 text-primary" />
                <h3 className="mt-3 text-lg font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <AskGeomacroSection />

      <section className="mx-auto w-full max-w-7xl px-4 pb-14 pt-4 sm:px-6 sm:pb-18">
        <div className="rounded-2xl border border-border/70 bg-card/45 p-6 sm:p-8">
          <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">Technical proof, kept separate</p>
              <h2 className="mt-3 text-2xl font-semibold">Arc, Circle and prediction-market work remain available without defining the commercial product.</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                These surfaces show testnet and programmable-finance implementation work. Geomacro's commercial identity remains risk intelligence and decision infrastructure.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Button asChild variant="outline"><Link to="/pipeline">Data Pipeline</Link></Button>
              <Button asChild variant="outline"><Link to="/arena">Prediction Markets</Link></Button>
              <Button asChild variant="outline"><Link to="/onchain">Arc / Onchain</Link></Button>
              <Button asChild variant="outline"><Link to="/bridge-swap">Bridge & Swap</Link></Button>
            </div>
          </div>
          <div className="mt-6 border-t border-border/60 pt-5 text-sm text-muted-foreground">
            For deeper proof, use <Link to="/research" className="text-primary hover:underline">Research</Link>, <Link to="/docs" className="text-primary hover:underline">Documentation</Link> or <Link to="/about" className="text-primary hover:underline">About & Trust</Link>.
          </div>
        </div>
      </section>
    </>
  );
}
