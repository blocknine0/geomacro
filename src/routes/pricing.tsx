import { useEffect, useState } from "react";
import { LowBarrierPricing } from "@/components/low-barrier-pricing";
import { StructuredProductSetup } from "../components/structured-product-setup";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ArrowUpRight, Braces, CheckCircle2, Code2, Database, Globe2, ShieldCheck } from "lucide-react";
import { ApiKeysNotice } from "@/components/api-keys-notice";
import { CategoryApiPricing } from "@/components/category-api-pricing";
import { GEOMACRO_LOW_BARRIER_VERSION } from "@/lib/low-barrier-pricing";

const TITLE = "Store & API | Geomacro";
const DESCRIPTION =
  "Monthly GeoMacro Risk Gate Packs from $15, with 1,500–6,000 credits and unified Geopolitics, Macro / FX, and Critical Minerals pricing.";
const URL = "https://geomacro.live/pricing";
const highlights = [
  { label: "Geopolitics", icon: Globe2 },
  { label: "Macro / FX", icon: Database },
  { label: "Critical Minerals", icon: ShieldCheck },
] as const;
const PRICING_TABS = [
  ["plans", "Monthly packs"],
  ["payment-checkout", "Payment methods"],
  ["api-endpoints", "Per-call pricing"],
  ["prepare", "Prepare a request"],
  ["developer-access", "Agent access"],
] as const;
type PricingTab = (typeof PRICING_TABS)[number][0];

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: URL },
      { property: "og:image", content: "https://geomacro.live/og-image-v2.png" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: URL }],
  }),
  component: PricingPage,
});

function PricingPage() {
  const [activeTab, setActiveTab] = useState<PricingTab>("plans");

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (PRICING_TABS.some(([id]) => id === hash)) setActiveTab(hash as PricingTab);
  }, []);

  return (
    <main className="gm-container pb-16 pt-8 sm:pt-12" data-store-api-unified={GEOMACRO_LOW_BARRIER_VERSION}>
      <section className="relative isolate overflow-hidden rounded-[1.75rem] border border-primary/20 bg-gradient-to-br from-primary/10 via-background to-background px-6 py-9 sm:px-10 sm:py-12 lg:px-12 lg:py-14">
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-44 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-48 right-1/3 h-80 w-80 rounded-full bg-primary/5 blur-3xl" />
        <div className="relative grid gap-10 lg:grid-cols-[minmax(0,1.4fr)_minmax(270px,0.8fr)] lg:items-center">
          <div>
            <p className="gm-eyebrow">Geomacro Store · Risk Gate · API & Agents</p>
            <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
              Risk Gate pricing.
              <span className="block text-primary">One balance. Three categories.</span>
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
              Compare monthly Risk Gate Packs for Geopolitics, Macro / FX, and Critical Minerals. Each credit is worth $0.01 USD.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a href="#plans" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90">
                Explore Risk Gate Packs <ArrowRight className="h-4 w-4" />
              </a>
              <a href="#payment-checkout" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-primary/50 bg-background/80 px-5 py-3 text-sm font-semibold text-primary transition hover:bg-primary/5">
                Payment methods <ShieldCheck className="h-4 w-4" />
              </a>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-5 gap-y-3 text-xs font-medium text-muted-foreground">
              {highlights.map(({ label, icon: Icon }) => (
                <span key={label} className="inline-flex items-center gap-2">
                  <Icon className="h-4 w-4 text-primary" aria-hidden />
                  {label}
                </span>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-border/80 bg-background/80 p-6 shadow-xl shadow-primary/5 backdrop-blur-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Risk Gate</span>
              <Braces className="h-5 w-5 text-primary" aria-hidden />
            </div>
            <p className="mt-6 text-3xl font-semibold tracking-tight">One unified product</p>
            <p className="mt-2 text-sm text-muted-foreground">Geopolitics · Macro / FX · Critical Minerals</p>
            <p className="mt-1 text-xs text-muted-foreground">Geopolitics, Macro / FX and Critical Minerals</p>
            <div className="my-6 h-px bg-border" />
            <div className="space-y-3 text-sm">
              {[
                "Request-specific verified intelligence",
                "Transparent source coverage and limitations",
                "No charge for unqualified results",
              ].map((item) => (
                <p key={item} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                  {item}
                </p>
              ))}
            </div>
            <p className="mt-6 rounded-lg bg-muted/60 p-3 text-xs leading-5 text-muted-foreground">
              Pay with native USDC on Arc, Base, or Polygon when live activation is confirmed. Only verified payments create credits.
            </p>
          </div>
        </div>
      </section>

      <nav aria-label="Explore Risk Gate pricing" className="sticky top-16 z-30 -mx-4 mt-5 overflow-x-auto border-y border-border/70 bg-background/95 px-4 py-3 backdrop-blur-xl sm:top-[68px] sm:mx-0 sm:rounded-xl sm:border sm:px-5">
        <div role="tablist" className="flex min-w-max items-center gap-2 text-xs font-medium sm:gap-5">
          {PRICING_TABS.map(([id, title]) => (
            <button
              key={id}
              id={`pricing-tab-${id}`}
              type="button"
              role="tab"
              aria-selected={activeTab === id}
              aria-controls={id === "payment-checkout" ? "plans" : id}
              onClick={() => setActiveTab(id)}
              className={`rounded-lg px-3 py-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${activeTab === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
            >{title}</button>
          ))}
        </div>
      </nav>

      <section id="plans" role="tabpanel" aria-labelledby={`pricing-tab-${activeTab === "payment-checkout" ? "payment-checkout" : "plans"}`} hidden={activeTab !== "plans" && activeTab !== "payment-checkout"} className="scroll-mt-40 pt-12 sm:pt-16">
        <div className={`mb-7 max-w-3xl ${activeTab === "payment-checkout" ? "hidden" : ""}`}>
          <p className="gm-eyebrow">Risk Gate Packs · {GEOMACRO_LOW_BARRIER_VERSION}</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Monthly credit packs for every stage.</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Choose Small, Standard, or Best for one balance shared across the three Risk Gate categories.
          </p>
        </div>
        {/* Preserve the standalone pricing component marker used by the existing catalog contract: <LowBarrierPricing /> */}
        <LowBarrierPricing
          activeView={activeTab === "payment-checkout" ? "payment" : "packs"}
          onSelectPackForCheckout={() => setActiveTab("payment-checkout")}
        />
      </section>

      <section id="api-endpoints" role="tabpanel" aria-labelledby="pricing-tab-api-endpoints" hidden={activeTab !== "api-endpoints"} className="scroll-mt-40 pt-14 sm:pt-20">
        <div className="mb-6">
            <p className="gm-eyebrow">Risk Gate API</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">One endpoint. Three categories.</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            Choose a category and evidence tier. Eligible delivered results cost $0.15 BASIC, $0.20 STANDARD, or $0.30 COMPLEX.
            Pay-per-call settlement uses native USDC on Arc, Base, or Polygon when payment activation is confirmed.
          </p>
        </div>
        <CategoryApiPricing showPrices />
      </section>

      <section id="prepare" role="tabpanel" aria-labelledby="pricing-tab-prepare" hidden={activeTab !== "prepare"} className="scroll-mt-40 pt-14 sm:pt-20">
        <div className="mb-2 flex items-center gap-2 text-primary">
          <Code2 className="h-4 w-4" aria-hidden />
          <p className="gm-eyebrow">No-charge request preparation</p>
        </div>
        <StructuredProductSetup />
      </section>

      <section id="developer-access" role="tabpanel" aria-labelledby="pricing-tab-developer-access" hidden={activeTab !== "developer-access"} className="scroll-mt-40 pt-14 sm:pt-20">
        <div className="mb-6">
          <p className="gm-eyebrow">Agent and developer access</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Plan for repeat recharge.</h2>
        </div>
        <ApiKeysNotice />
        <p className="mt-4 max-w-3xl text-xs leading-6 text-muted-foreground">
          Paid API requests become available only when the live payment and delivery service confirms activation.
          Availability is checked for each request. A low-balance prompt is planned below $2.00, and agents can use the
          <a href="/api/v1/payments/usdc-risk-gate" className="mx-1 underline underline-offset-2">mainnet USDC pay-per-call route</a>
          for eligible deliveries. Customers keep control of every action; Risk Gate never authorizes or submits transactions.
        </p>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <Link to="/docs" className="group flex items-start justify-between gap-5 rounded-2xl border border-border p-6 transition hover:border-primary/40 hover:bg-primary/5">
            <div>
              <p className="text-base font-semibold">Developer documentation</p>
              <p className="mt-2 text-sm text-muted-foreground">Risk Gate API schema, evidence eligibility, and delivery contracts.</p>
            </div>
            <ArrowUpRight className="h-5 w-5 shrink-0 text-primary" aria-hidden />
          </Link>
          <Link to="/contact" className="group flex items-start justify-between gap-5 rounded-2xl border border-border p-6 transition hover:border-primary/40 hover:bg-primary/5">
            <div>
              <p className="text-base font-semibold">Discuss your workflow</p>
              <p className="mt-2 text-sm text-muted-foreground">Discuss Risk Gate pricing, volumes, and agent integration access.</p>
            </div>
            <ArrowUpRight className="h-5 w-5 shrink-0 text-primary" aria-hidden />
          </Link>
        </div>
      </section>

      <section className="mt-16 grid gap-5 border-t border-border pt-8 md:grid-cols-2">
        <div>
          <h2 className="text-lg font-semibold">Just exploring?</h2>
          <p className="mt-2 text-sm text-muted-foreground">Review categories, evidence tiers, and request readiness.</p>
          <Link to="/risk-gate" className="gm-text-link mt-4">
            Open Risk Gate <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div>
          <h2 className="text-lg font-semibold">Building for a team?</h2>
          <p className="mt-2 text-sm text-muted-foreground">See public Risk Gate findings or discuss a team workflow across the three categories.</p>
          <Link to="/intelligence" className="gm-text-link mt-4">
            Open intelligence <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </main>
  );
}
