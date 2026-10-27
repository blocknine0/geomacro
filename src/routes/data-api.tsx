import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { ApiKeysNotice } from "@/components/api-keys-notice";
import { CapabilityPriceSchedule } from "@/components/capability-price-schedule";
const TITLE = "API & Agents | Geomacro";
const DESCRIPTION =
  "See what Geomacro structured-data products deliver and their per-delivery USDC prices across Geopolitics, Macro/FX and Critical Minerals.";
const URL = "https://geomacro.live/data-api";
export const Route = createFileRoute("/data-api")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: URL },
      { property: "og:image", content: "https://geomacro.live/og-image-v2.png" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: URL }],
  }),
  component: DataApiPage,
});

function DataApiPage() {
  return (
    <main className="gm-container py-12 sm:py-16">
      <header className="max-w-3xl">
        <p className="gm-eyebrow">API & Agents</p>
        <h1 className="gm-page-title">Structured intelligence. Clear pricing.</h1>
        <p className="gm-intro">
          Geopolitics, Macro / FX and Critical Minerals for your applications and agents.
          Choose a product below to see what you receive and its price per delivery.
        </p>
      </header>
      <div className="mt-8"><ApiKeysNotice /></div>
      <div className="mt-10"><CapabilityPriceSchedule compact /></div>
      <p className="mt-6 max-w-3xl text-sm leading-6 text-muted-foreground">
        All products deliver structured Geomacro JSON. Availability is checked for each request.
        Risk Gate includes its Signed Risk Object without a second object charge.
        Signed risk products are private pilots; customers retain control of every action.
      </p>
      <p className="mt-3 max-w-3xl text-xs leading-6 text-muted-foreground">
        Paid API requests become available only when the live payment and delivery service confirms activation.
      </p>
      <div className="mt-8 flex flex-wrap gap-6 border-t border-border pt-6">
        <Link to="/contact" className="gm-text-link">
          Discuss your workflow <ArrowRight className="h-4 w-4" />
        </Link>
        <Link to="/docs" className="gm-text-link">
          Developer documentation <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </main>
  );
}
