import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Bot,
  Braces,
  CheckCircle2,
  Database,
  Radio,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const TITLE = "AI Agent Risk Intelligence & Pay-per-Call Access | Geomacro";
const DESCRIPTION =
  "Preview Geomacro's pre-launch pay-per-call AI agent access, free trader research, professional subscriptions, governed API access and Risk Gate plans.";
const URL = "https://geomacro.live/agent-access";
const IMAGE = "https://geomacro.live/og-image-v2.png";

const PLANS = [
  {
    status: "LIVE · FREE",
    title: "Free Explorer",
    audience: "Individuals, traders and researchers",
    price: "Free",
    features: [
      "Public Risk Intelligence",
      "Geopolitical, Macroeconomic and Critical Minerals Risk Indices",
      "Ask Geomacro grounded in stored evidence",
      "Public methodology, research and verification context",
      "No API credential or paid machine delivery",
    ],
  },
  {
    status: "PRE-LAUNCH · MAINNET",
    title: "Pay per call",
    audience: "AI agents, trading tools and automated workflows",
    price: "Prepared launch price: 0.02 USDC / successful paid call",
    features: [
      "Free deliverability check before payment",
      "Exact price presented before settlement",
      "Question-adaptive geopolitical and macro risk intelligence",
      "Machine-readable response with provenance and freshness context",
      "Replay, duplicate-charge and payment/query binding controls",
    ],
  },
  {
    status: "FOUNDING PILOT",
    title: "Professional intelligence",
    audience: "Analysts, active traders and small professional teams",
    price: "5,000 credits / 30 days",
    features: [
      "Deeper analytics and historical context",
      "Change attribution and governed country/corridor views",
      "Agreed structured exports where scoped",
      "Professional research workflow without execution custody",
      "Pilot terms agreed before activation",
    ],
  },
  {
    status: "FOUNDING PILOT",
    title: "API + Risk Gate",
    audience: "Developers, fintechs, treasury and agent teams",
    price: "20,000 credits / 30 days",
    features: [
      "Authenticated governed machine-readable data",
      "Country/corridor digests and profiles",
      "Signed Risk Objects and Risk Gate bundles",
      "Controlled API/export access for the agreed workflow",
      "Geomacro never authorizes downstream execution",
    ],
  },
  {
    status: "INSTITUTIONAL",
    title: "Contracted deployment",
    audience: "Financial institutions and larger operating teams",
    price: "100,000-credit monthly starting pool, then contracted volume",
    features: [
      "Contracted countries, corridors and historical depth",
      "Higher API volume and monitoring cadence",
      "Structured exports and governed integration scope",
      "Enterprise controls/support only where implemented and contracted",
      "Customer-owned identity, policy, funds and execution",
    ],
  },
] as const;

const FLOW = [
  ["1", "Ask", "The agent sends a supported question, subject and requested risk topics."],
  ["2", "Check", "Geomacro first proves that the requested intelligence is currently deliverable. Undeliverable requests are not charged."],
  ["3", "Price & pay", "When mainnet access is enabled, the agent receives an HTTP 402 payment requirement with the exact USDC price bound to that query."],
  ["4", "Receive", "After verified settlement, Geomacro returns the governed machine-readable intelligence response. Any Risk Gate context remains advisory and non-executing."],
] as const;

export const Route = createFileRoute("/agent-access")({
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
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
    ],
    links: [{ rel: "canonical", href: URL }],
  }),
  component: AgentAccessPage,
});

function AgentAccessPage() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
      <section className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
        <div>
          <Badge variant="outline" className="border-amber-400/35 bg-amber-400/5 font-mono text-[11px] text-amber-200">
            MAINNET PAY-PER-CALL · PRE-LAUNCH · REAL FUNDS OFF
          </Badge>
          <h1 className="mt-5 max-w-4xl text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
            One risk question. One priced call. One machine-readable answer.
          </h1>
          <p className="mt-5 max-w-3xl text-lg leading-relaxed text-muted-foreground">
            Geomacro is preparing a pay-per-call risk-intelligence service for AI agents and automated financial workflows. A supported request is checked for deliverability first, priced before payment, and answered only after verified settlement.
          </p>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            The production payment path is prepared but intentionally locked. No mainnet real-money purchase is enabled until Geomacro's coordinated launch gates and explicit owner authorization are complete.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg" className="gap-2">
              <Link to="/intelligence">Use free intelligence <ArrowRight className="h-4 w-4" /></Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/data-api">See governed API access</Link>
            </Button>
            <Button asChild size="lg" variant="ghost">
              <Link to="/contact">Discuss a commercial pilot</Link>
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border border-border/70 bg-card/55 p-6 sm:p-7">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">Example agent request</p>
          <pre className="mt-4 overflow-x-auto rounded-xl border border-border/60 bg-background/70 p-4 text-xs leading-relaxed text-muted-foreground">
{`{
  "question": "What are the current macro, FX and geopolitical risks for India?",
  "subjects": [{ "type": "country", "country_iso3": "IND" }],
  "topics": ["macro_risk", "fx_external_risk", "conflict_geopolitics"],
  "max_age_seconds": 86400,
  "detail": "standard"
}`}
          </pre>
          <div className="mt-5 rounded-xl border border-primary/20 bg-primary/[0.04] p-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Prepared launch economics</p>
            <p className="mt-2 text-2xl font-semibold">0.02 USDC / successful paid call</p>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Static website pricing is informational. When the service is enabled, the live HTTP 402 challenge or approved provider plan is the payment authority.
            </p>
          </div>
        </div>
      </section>

      <section className="mt-16">
        <div className="max-w-3xl">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Who gets what</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Start free. Pay only when the workflow needs more.</h2>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            Public research stays available for people evaluating Geomacro. Professional subscriptions add depth and workflow capacity. Pay-per-call access is designed for software that needs a governed answer without committing to a monthly plan.
          </p>
        </div>
        <div className="mt-8 grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
          {PLANS.map((plan) => (
            <article key={plan.title} className="flex h-full flex-col rounded-2xl border border-border/70 bg-card/50 p-6">
              <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-primary">{plan.status}</p>
              <h3 className="mt-3 text-2xl font-semibold">{plan.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{plan.audience}</p>
              <p className="mt-4 font-medium text-foreground">{plan.price}</p>
              <ul className="mt-5 space-y-3 text-sm leading-relaxed text-muted-foreground">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-16 grid gap-8 lg:grid-cols-[0.85fr_1.15fr]">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Pay-per-call flow</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight">No charge before Geomacro knows it can deliver.</h2>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            The commercial machine path is designed to fail closed. Unsupported or unavailable requests stop before payment instead of selling an empty or fabricated answer.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild variant="outline"><Link to="/docs">Read the documentation</Link></Button>
            <Button asChild variant="outline"><Link to="/risk-gate">See Risk Gate</Link></Button>
          </div>
        </div>
        <ol className="space-y-3">
          {FLOW.map(([step, title, body]) => (
            <li key={step} className="grid grid-cols-[36px_minmax(0,1fr)] gap-3 rounded-2xl border border-border/70 bg-card/45 p-4">
              <span className="flex h-9 w-9 items-center justify-center rounded-full border border-primary/30 bg-primary/10 font-mono text-xs text-primary">{step}</span>
              <div>
                <h3 className="font-semibold">{title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-16 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-2xl border border-border/70 bg-card/45 p-5">
          <Radio className="h-5 w-5 text-primary" />
          <h3 className="mt-3 font-semibold">For traders</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Use the free site to understand current geopolitical, macro and critical-mineral risk before deciding whether deeper professional access is useful.</p>
        </article>
        <article className="rounded-2xl border border-border/70 bg-card/45 p-5">
          <Bot className="h-5 w-5 text-primary" />
          <h3 className="mt-3 font-semibold">For AI agents</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Buy one governed answer only when the query is deliverable, with price and query bound before settlement.</p>
        </article>
        <article className="rounded-2xl border border-border/70 bg-card/45 p-5">
          <Braces className="h-5 w-5 text-primary" />
          <h3 className="mt-3 font-semibold">For developers</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Use the governed API, signed Risk Objects and machine discovery to integrate risk context into software.</p>
        </article>
        <article className="rounded-2xl border border-border/70 bg-card/45 p-5">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h3 className="mt-3 font-semibold">For institutions</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Contract scope, source rights, controls, volume and support for a defined workflow instead of relying on a consumer plan.</p>
        </article>
      </section>

      <section className="mt-16 rounded-2xl border border-border/70 bg-card/50 p-6 sm:p-8">
        <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr]">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Commercial safety boundary</p>
            <h2 className="mt-3 text-2xl font-semibold">Risk intelligence, not delegated trading authority.</h2>
          </div>
          <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>Geomacro can provide external risk context to a trader, application or autonomous agent. It does not decide whether a trade, payment or transfer should execute.</p>
            <p>Risk Gate outputs remain advisory. Customer identity, permissions, policy, funds and downstream execution stay customer-controlled, and <code>execution_authorized=false</code>.</p>
            <p>Geomacro output is informational risk intelligence, not individualized investment advice or a guarantee of market outcomes.</p>
          </div>
        </div>
      </section>

      <section className="mt-16 rounded-2xl border border-primary/25 bg-primary/[0.04] p-6 text-center sm:p-8">
        <Database className="mx-auto h-6 w-6 text-primary" />
        <h2 className="mt-3 text-3xl font-semibold">Evaluate the free product before paying for machine access.</h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Open the live intelligence and Risk Indices now. When mainnet pay-per-call is deliberately activated, this page will switch from PRE-LAUNCH to the verified live commercial state.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button asChild><Link to="/intelligence">Explore intelligence</Link></Button>
          <Button asChild variant="outline"><Link to="/global-risk">View Risk Indices</Link></Button>
          <Button asChild variant="outline"><Link to="/contact">Talk to Geomacro</Link></Button>
        </div>
      </section>
    </main>
  );
}
