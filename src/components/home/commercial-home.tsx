import { Link } from "@tanstack/react-router";
import { ArrowRight, Globe2, Landmark, Layers3 } from "lucide-react";
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
        <div className="gm-container grid items-center gap-12 py-14 sm:py-20 lg:grid-cols-2 lg:gap-16">
          <div>
            <p className="gm-eyebrow">Global risk intelligence · For people & AI agents</p>
            <h1 className="mt-6 text-[clamp(3rem,6vw,5.5rem)] font-semibold leading-[1.02] tracking-[-0.055em]">
              Understand global risk.
              <br />
              <span className="text-primary">Know what matters.</span>
            </h1>
            <p className="mt-6 max-w-md text-lg leading-8 text-muted-foreground">
              Geomacro explains developments in Geopolitics, Macro / FX and Critical Minerals: what changed, why it matters and what to watch next.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link to="/intelligence">
                  Explore intelligence <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/ask-geomacro">Ask Geomacro</Link>
              </Button>
            </div>
            <p className="mt-5 text-xs text-muted-foreground">
              For research, treasury and supply-chain decisions.
            </p>
            <p className="mt-3 text-xs text-muted-foreground">Free to explore · No account needed</p>
          </div>
          <LiveIntelligenceShowcase initialFindCards={initialFindCards} />
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
              className="group bg-background p-7 transition hover:bg-card sm:p-8"
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
        <div className="gm-container grid gap-8 py-12 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <p className="gm-eyebrow">Your next step</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">
              Read it. Question it. Use the context.
            </h2>
            <p className="mt-3 text-muted-foreground">
              Browse free findings, ask a country or corridor question, or inspect the dates behind a Risk Index.
            </p>
          </div>
          <Button asChild variant="outline" size="lg">
            <Link to="/ask-geomacro">
              Ask Geomacro <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>
      <section className="gm-container flex flex-wrap items-center justify-between gap-6 py-12">
        <div>
          <p className="gm-eyebrow">For applications & agents</p>
          <h2 className="mt-3 text-2xl font-semibold">
            The same intelligence. Structured for your workflow.
          </h2>
          <p className="mt-3 text-sm text-muted-foreground">
            Explore products and exact USDC prices. API keys coming soon.
          </p>
        </div>
        <Link to="/pricing" className="gm-text-link">
          Visit the Store <ArrowRight className="h-4 w-4" />
        </Link>
      </section>
    </>
  );
}
