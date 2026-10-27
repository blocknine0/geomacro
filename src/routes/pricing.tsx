import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { CapabilityPriceSchedule } from "@/components/capability-price-schedule";
import { ApiKeysNotice } from "@/components/api-keys-notice";
import { CategoryApiPricing } from "@/components/category-api-pricing";
import { CategoryApiLaunchPanel } from "@/components/category-api-launch-panel";

const TITLE = "Store & Pricing | Geomacro";
const DESCRIPTION =
  "See canonical per-call USDC prices for Geopolitics, Macro/FX and Critical Minerals APIs, plus approved structural intelligence products.";
const URL = "https://geomacro.live/pricing";

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
  return (
    <main className="gm-container py-12 sm:py-16">
      <header className="mb-8 max-w-3xl">
        <p className="gm-eyebrow">Geomacro Store</p>
        <h1 className="gm-page-title">Intelligence for your next move.</h1>
        <p className="gm-intro">
          Choose a product. See what you receive and the exact price per delivery.
        </p>
      </header>
      <ApiKeysNotice />
      <div className="mt-10">
        <CategoryApiPricing />
      </div>
      <div className="mt-10">
        <CapabilityPriceSchedule />
      </div>
      <details className="mt-10 rounded-2xl border border-border p-5 sm:p-6">
        <summary className="cursor-pointer text-base font-semibold">
          Check a Country Digest — 0.02 USDC if qualified
        </summary>
        <p className="mt-3 text-sm text-muted-foreground">
          Evidence and commercial reuse rights are verified before any payment
          request. Merchant activation is required; a catalog price is not a live quote.
          Unavailable results remain free and no real-money payment runs automatically.
        </p>
        <CategoryApiLaunchPanel initialMode="country_digest" />
      </details>
      <section className="mt-10 grid gap-5 border-t border-border pt-8 md:grid-cols-2">
        <div>
          <h2 className="text-lg font-semibold">Just exploring?</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Read public findings and use Ask Geomacro for free.
          </p>
          <Link to="/intelligence" className="gm-text-link mt-4">
            Open intelligence <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div>
          <h2 className="text-lg font-semibold">Building for a team?</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Discuss your scope, volume and delivery needs.
          </p>
          <Link to="/contact" className="gm-text-link mt-4">
            Contact Geomacro <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </main>
  );
}
