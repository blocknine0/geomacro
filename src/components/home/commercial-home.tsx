import { Link } from "@tanstack/react-router";
import { ArrowRight, Bot, BookOpen, Globe2, Landmark, Layers3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LiveIntelligenceShowcase } from "@/components/home/live-intelligence-showcase";
import type { FindCardV1 } from "@/lib/find-card-v1";

const DOMAINS = [
  {
    category: "geopolitics",
    title: "Geopolitics",
    text: "Conflict, sanctions and policy shifts.",
    icon: Globe2,
  },
  {
    category: "macro",
    title: "Macro / FX",
    text: "Rates, inflation and currency pressure.",
    icon: Landmark,
  },
  {
    category: "rare_earth",
    title: "Critical Minerals",
    text: "Supply, export controls and rare earths.",
    icon: Layers3,
  },
] as const;

export function CommercialHome({ initialFindCards = [] }: { initialFindCards?: FindCardV1[] }) {
  return (
    <>
      <section className="gm-hero border-b border-border">
        <div className="gm-container grid items-center gap-10 py-12 sm:py-16 lg:grid-cols-2 lg:gap-14">
          <div>
            <p className="gm-eyebrow">Global risk intelligence · For people & AI agents</p>
            <h1 className="mt-6 text-[clamp(2.5rem,4.5vw,4rem)] font-semibold leading-[1.02] tracking-[-0.055em]">
              Understand global risk.
              <br />
              <span className="text-primary">Know what matters.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground">
              <strong className="font-medium text-foreground">Geomacro is a global intelligence platform.</strong>{" "}
              We explain what changed in Geopolitics, Macro / FX and Critical Minerals,
              why it matters and what to watch next.
            </p>
            <p className="mt-3 max-w-xl text-base leading-7 text-muted-foreground">
              Read the context. Ask a question. Get structured data for your application or AI agent.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link to="/intelligence">
                  Explore intelligence <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/data-api">View products &amp; prices</Link>
              </Button>
            </div>
            <p className="mt-5 text-xs text-muted-foreground">
              For research, treasury and supply-chain decisions.
            </p>
            <p className="mt-3 text-xs text-muted-foreground">Free to explore · No account needed</p>
          </div>
          <aside aria-labelledby="home-use-title" className="min-w-0 rounded-2xl border border-border bg-card/60 p-6 sm:p-8">
            <p className="gm-eyebrow">Find your starting point</p>
            <h2 id="home-use-title" className="mt-3 text-2xl font-semibold tracking-tight">One platform. Two ways to use it.</h2>
            <div className="mt-6 space-y-4">
              <div className="rounded-xl border border-border bg-background/60 p-5">
                <BookOpen className="h-5 w-5 text-primary" aria-hidden />
                <h3 className="mt-3 text-lg font-semibold">For people</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">Read clear findings, explore country risks and ask questions in plain language.</p>
                <Link to="/ask-geomacro" className="gm-text-link mt-3">Ask Geomacro <ArrowRight className="h-4 w-4" aria-hidden /></Link>
              </div>
              <div className="rounded-xl border border-border bg-background/60 p-5">
                <Bot className="h-5 w-5 text-primary" aria-hidden />
                <h3 className="mt-3 text-lg font-semibold">For applications &amp; agents</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">Country and corridor digests, profiles and answers delivered as structured JSON.</p>
                <Link to="/data-api" className="gm-text-link mt-3">See products and prices <ArrowRight className="h-4 w-4" aria-hidden /></Link>
                <p className="mt-2 text-xs text-muted-foreground">API keys and self-service checkout coming soon.</p>
              </div>
            </div>
          </aside>
        </div>
      </section>
      <section className="gm-container py-12 sm:py-16">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="gm-eyebrow">Follow what matters to you</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">
              Follow the risks that affect your work.
            </h2>
          </div>
          <Link to="/risk-indices" className="gm-text-link">
            View Risk Indices <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="mt-8 grid gap-px overflow-hidden rounded-2xl border border-border bg-border md:grid-cols-3">
          {DOMAINS.map(({ category, title, text, icon: Icon }, i) => (
            <Link
              key={category}
              to="/intelligence"
              search={{ category }}
              className="group min-w-0 bg-background p-7 transition hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary sm:p-8"
            >
              <div className="flex items-center justify-between">
                <Icon className="h-6 w-6 text-primary" />
                <span className="font-mono text-xs text-muted-foreground">0{i + 1}</span>
              </div>
              <h3 className="mt-8 text-xl font-semibold">{title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{text}</p>
              <span className="mt-6 inline-flex items-center gap-2 text-sm text-primary">
                Browse findings{" "}
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
              </span>
            </Link>
          ))}
        </div>
      </section>
      <section className="border-y border-border bg-card/30">
        <div className="gm-container py-12 sm:py-16">
          <p className="gm-eyebrow">Your next step</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight">Choose what you need.</h2>
          <div className="mt-7 grid gap-4 md:grid-cols-3">
            {[
              { to: "/intelligence", title: "Understand a development", text: "Read what happened, why it matters and the original publication date.", action: "Read findings" },
              { to: "/risk-indices", title: "Explore country risk", text: "Inspect available risk readings, their dates and coverage limits.", action: "View Risk Indices" },
              { to: "/institutional", title: "Plan a team workflow", text: "Discuss research, treasury and supply-chain intelligence needs.", action: "For teams" },
            ].map(({ to, title, text, action }) => (
              <Link key={to} to={to} className="group rounded-xl border border-border bg-background p-6 transition hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                <h3 className="font-semibold">{title}</h3>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{text}</p>
                <span className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-primary">{action}<ArrowRight className="h-4 w-4" aria-hidden /></span>
              </Link>
            ))}
          </div>
        </div>
      </section>
      <section aria-labelledby="home-finds-title" className="gm-container grid gap-8 py-12 sm:py-16 lg:grid-cols-2 lg:items-center">
        <div className="max-w-lg">
          <p className="gm-eyebrow">From the intelligence desk</p>
          <h2 id="home-finds-title" className="mt-3 text-3xl font-semibold tracking-tight">Explore Geomacro Finds.</h2>
          <p className="mt-4 text-base leading-7 text-muted-foreground">Short explanations of global developments, with publication dates and the context behind them. Availability varies by country, topic and publication window.</p>
          <Link to="/intelligence" className="gm-text-link mt-5">Open intelligence <ArrowRight className="h-4 w-4" aria-hidden /></Link>
        </div>
        <LiveIntelligenceShowcase initialFindCards={initialFindCards} />
      </section>
      <section className="gm-container flex flex-wrap items-center justify-between gap-6 py-12">
        <div>
          <p className="gm-eyebrow">For applications & agents</p>
          <h2 className="mt-3 text-2xl font-semibold">
            The same intelligence. Structured for your workflow.
          </h2>
          <p className="mt-3 text-sm text-muted-foreground">
            Monthly plans from $9, one-time credit packs from $5, and Base USDC x402 at $0.02–$0.05 per eligible call. Checkout availability is verified separately.
          </p>
        </div>
        <Link to="/pricing" className="gm-text-link">
          Visit the Store <ArrowRight className="h-4 w-4" />
        </Link>
      </section>
    </>
  );
}
