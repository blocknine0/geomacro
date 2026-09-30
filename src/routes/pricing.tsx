import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Bot, Check, CircleDollarSign, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

const TITLE = "Pricing | Geomacro";
const DESCRIPTION = "Geomacro Free Explorer and x402 pay-per-call pricing for decision-ready geopolitical, macroeconomic and critical-mineral intelligence.";

const FREE_ACCESS = [
  "Public Intelligence explorer",
  "Separate Geopolitical, Macroeconomic and Critical Minerals Risk Indices",
  "Ask Geomacro grounded query experience",
  "Public research, methodology and trust documentation",
] as const;

const PAID_ACCESS = [
  "Concise direct answer with what changed and why it matters",
  "Current risk state, direction, confidence and top drivers",
  "Bounded structural context and current developments",
  "Machine-readable JSON with stable state and delivery hashes",
  "Derived Geomacro intelligence only; no raw upstream data dump",
] as const;

function PricingPage() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 sm:py-18 lg:py-20">
      <section className="max-w-4xl">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-primary sm:text-xs">Simple access model</p>
        <h1 className="mt-4 text-[clamp(2.7rem,6vw,5.4rem)] font-semibold leading-[0.95] tracking-[-0.05em]">
          Explore free. Pay only when a machine needs a commercial delivery.
        </h1>
        <p className="mt-6 max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
          The public Geomacro website remains free to explore. Structured commercial machine delivery uses x402 pay-per-call in USDC, with no subscription required for the launch offer.
        </p>
      </section>

      <section className="mt-12 grid gap-5 lg:grid-cols-2 lg:gap-6">
        <article className="rounded-[1.75rem] border border-border/65 bg-card/35 p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Free Explorer</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight">$0</h2>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-border/70 bg-background/40 text-muted-foreground">
              <Sparkles className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-5 text-sm leading-6 text-muted-foreground">
            For people evaluating Geomacro, following current risk context or using the public browser experience.
          </p>
          <ul className="mt-6 space-y-3">
            {FREE_ACCESS.map((item) => (
              <li key={item} className="flex gap-3 text-sm leading-6">
                <Check className="mt-1 h-4 w-4 shrink-0 text-primary" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <div className="mt-7 rounded-xl border border-border/60 bg-background/25 p-4 text-xs leading-5 text-muted-foreground">
            Free Explorer is website/dashboard access. It is not a free structured commercial API.
          </div>
          <Button asChild variant="outline" className="mt-6 w-full sm:w-auto">
            <Link to="/intelligence">Open Free Explorer</Link>
          </Button>
        </article>

        <article className="relative overflow-hidden rounded-[1.75rem] border border-primary/30 bg-[linear-gradient(145deg,color-mix(in_oklab,var(--primary)_12%,var(--card)),var(--card)_48%)] p-6 sm:p-8">
          <div className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
          <div className="relative">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">x402 Pay per call</p>
                <div className="mt-3 flex items-end gap-2">
                  <h2 className="text-4xl font-semibold tracking-tight">0.05</h2>
                  <span className="pb-1 text-sm text-muted-foreground">USDC / successful delivery</span>
                </div>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary">
                <CircleDollarSign className="h-5 w-5" />
              </div>
            </div>

            <p className="mt-5 text-sm leading-6 text-muted-foreground">
              Launch price for the first 20,000 successfully settled and delivered commercial intelligence calls. Failed, stale, unavailable, replayed or unpaid requests do not count as successful paid deliveries.
            </p>

            <ul className="mt-6 space-y-3">
              {PAID_ACCESS.map((item) => (
                <li key={item} className="flex gap-3 text-sm leading-6">
                  <Check className="mt-1 h-4 w-4 shrink-0 text-primary" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-border/60 bg-background/25 p-4">
                <div className="flex items-center gap-2 text-xs font-medium"><ShieldCheck className="h-4 w-4 text-primary" /> No-charge failure policy</div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">If Geomacro cannot deliver a fresh, eligible result, the request must fail closed rather than manufacture an answer.</p>
              </div>
              <div className="rounded-xl border border-border/60 bg-background/25 p-4">
                <div className="flex items-center gap-2 text-xs font-medium"><Bot className="h-4 w-4 text-primary" /> Built for machines</div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">The canonical machine resource is POST /api/x402/intelligence with structured JSON delivery.</p>
              </div>
            </div>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Button asChild className="gap-2">
                <Link to="/data-api">View API & Agent Access <ArrowRight className="h-4 w-4" /></Link>
              </Button>
              <Button asChild variant="outline"><Link to="/docs">Read documentation</Link></Button>
            </div>
          </div>
        </article>
      </section>

      <section className="mt-10 grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-border/60 bg-card/25 p-5">
          <p className="text-sm font-semibold">No raw-data resale</p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">Commercial responses contain derived Geomacro intelligence, not unrestricted upstream payloads, article text or internal provenance blobs.</p>
        </div>
        <div className="rounded-2xl border border-border/60 bg-card/25 p-5">
          <p className="text-sm font-semibold">No automatic price jump</p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">Any post-launch pricing change is an explicit commercial update. It is not automatically triggered by the intelligence engine.</p>
        </div>
        <div className="rounded-2xl border border-border/60 bg-card/25 p-5">
          <p className="text-sm font-semibold">Production status stays explicit</p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">Real-money x402 remains fail-closed until the production launch gates and owner authorization are satisfied.</p>
        </div>
      </section>
    </main>
  );
}

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://geomacro.live/pricing" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
    ],
    links: [{ rel: "canonical", href: "https://geomacro.live/pricing" }],
  }),
  component: PricingPage,
});
