import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { DocumentHeader } from "@/components/docs/docs-layout";
import { DOCS_CURRENT_OVERVIEW, DOCS_GROUPS, DOCS_PAGE_COUNT } from "@/lib/docs-content";

const TITLE = "GeoMacro Docs | Risk Gate, Evidence & Pricing";
const DESCRIPTION =
  "Get started with GeoMacro: signed Risk Gate decisions, verified evidence, clear per-call prices, and monthly packs.";
const URL = "https://geomacro.live/docs";
const IMAGE = "https://geomacro.live/og-image-v2.png";

export const Route = createFileRoute("/docs")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      {
        name: "robots",
        content: "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1",
      },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: URL },
      { property: "og:image", content: IMAGE },
      { property: "og:image:secure_url", content: IMAGE },
      { property: "og:image:alt", content: "Geomacro public risk intelligence documentation" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
      { name: "twitter:image", content: IMAGE },
      { name: "twitter:image:alt", content: "Geomacro public risk intelligence documentation" },
    ],
    links: [{ rel: "canonical", href: URL }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "Geomacro Documentation",
          url: URL,
          description: DESCRIPTION,
          inLanguage: "en",
          isPartOf: { "@id": "https://geomacro.live/#website" },
          publisher: { "@id": "https://geomacro.live/#organization" },
          mainEntity: {
            "@type": "ItemList",
            name: "Documentation",
            numberOfItems: DOCS_PAGE_COUNT,
          },
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            {
              "@type": "ListItem",
              position: 1,
              name: "Geomacro",
              item: "https://geomacro.live/",
            },
            {
              "@type": "ListItem",
              position: 2,
              name: "Documentation",
              item: URL,
            },
          ],
        }),
      },
    ],
  }),
  component: DocsIndexPage,
});

function DocsIndexPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:py-14">
      <main>
        <DocumentHeader />
        <section className="rounded-3xl border border-primary/25 bg-gradient-to-br from-primary/10 via-card/50 to-background p-6 sm:p-10">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
            GeoMacro Docs
          </p>
          <h1 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight text-foreground sm:text-5xl">
            {DOCS_CURRENT_OVERVIEW.headline}
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground">
            {DOCS_CURRENT_OVERVIEW.summary}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {DOCS_CURRENT_OVERVIEW.categories.map((category) => (
              <span
                key={category}
                className="rounded-full border border-border/70 bg-background/50 px-3 py-1.5 text-xs font-medium text-foreground"
              >
                {category}
              </span>
            ))}
          </div>
          <div className="mt-7 flex flex-wrap gap-3 text-sm">
            <Link
              to="/intelligence"
              className="rounded-lg border border-primary/35 bg-primary/10 px-4 py-2 font-medium text-primary hover:border-primary/70"
            >
              Explore free Intelligence
            </Link>
            <Link
              to="/risk-gate"
              className="rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground hover:bg-primary/90"
            >
              Open Risk Gate
            </Link>
            <Link
              to="/pricing"
              className="rounded-lg border border-border/70 px-4 py-2 font-medium text-foreground hover:border-primary/50"
            >
              Visit Store
            </Link>
          </div>
        </section>

        <section className="mt-10" aria-labelledby="docs-pricing-title">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
                Clear pricing
              </p>
              <h2 id="docs-pricing-title" className="mt-2 text-2xl font-semibold tracking-tight">
                Pay per eligible Risk Gate delivery
              </h2>
            </div>
            <Link
              to="/pricing"
              className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
            >
              See current pricing <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {DOCS_CURRENT_OVERVIEW.perCallTiers.map((tier) => (
              <div key={tier.name} className="rounded-xl border border-border bg-card/40 p-5">
                <p className="font-mono text-xs font-semibold tracking-wider text-muted-foreground">
                  {tier.name}
                </p>
                <p className="mt-2 text-2xl font-semibold">
                  {tier.price}
                  <span className="ml-1 text-sm font-normal text-muted-foreground">
                    per eligible delivery
                  </span>
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-10" aria-labelledby="docs-packs-title">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
                Monthly packs
              </p>
              <h2 id="docs-packs-title" className="mt-2 text-2xl font-semibold tracking-tight">
                Recharge when it suits your team
              </h2>
            </div>
            <p className="text-sm text-muted-foreground">{DOCS_CURRENT_OVERVIEW.creditValue}</p>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {DOCS_CURRENT_OVERVIEW.monthlyPacks.map((pack) => (
              <div key={pack.name} className="rounded-xl border border-border bg-card/40 p-5">
                <p className="text-sm font-semibold">{pack.name}</p>
                <p className="mt-2 text-2xl font-semibold">{pack.price}</p>
                <p className="mt-1 text-sm text-muted-foreground">{pack.credits}</p>
                <p className="mt-3 text-xs leading-5 text-muted-foreground">
                  {DOCS_CURRENT_OVERVIEW.rollover}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section
          className="mt-10 rounded-2xl border border-border/70 bg-card/30 p-5 sm:p-7"
          aria-labelledby="docs-quick-start-title"
        >
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
            Quick start
          </p>
          <h2 id="docs-quick-start-title" className="mt-2 text-2xl font-semibold tracking-tight">
            Start in 3 steps
          </h2>
          <ol className="mt-5 grid gap-3 md:grid-cols-3">
            <li className="rounded-xl border border-border/70 bg-background/40 p-4">
              <p className="font-mono text-xs text-primary">01</p>
              <p className="mt-2 font-semibold">See what changed</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Browse current public findings across the three risk categories.
              </p>
              <Link
                to="/intelligence"
                className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
              >
                Open Intelligence <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </li>
            <li className="rounded-xl border border-border/70 bg-background/40 p-4">
              <p className="font-mono text-xs text-primary">02</p>
              <p className="mt-2 font-semibold">Review a Risk Gate</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Turn verified evidence into a signed, structured decision for your workflow.
              </p>
              <Link
                to="/risk-gate"
                className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
              >
                Open Risk Gate <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </li>
            <li className="rounded-xl border border-border/70 bg-background/40 p-4">
              <p className="font-mono text-xs text-primary">03</p>
              <p className="mt-2 font-semibold">Choose your access</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Compare per-call pricing and monthly credit packs before you start.
              </p>
              <Link
                to="/pricing"
                className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
              >
                View pricing <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </li>
          </ol>
        </section>

        <details className="group mt-10 rounded-xl border border-border/70 bg-card/20 p-5">
          <summary className="cursor-pointer font-semibold">
            Browse the full documentation ({DOCS_PAGE_COUNT} guides)
          </summary>
          <div className="mt-5 grid gap-6 border-t border-border/70 pt-5 sm:grid-cols-2 lg:grid-cols-3">
            {DOCS_GROUPS.map((group) => (
              <section key={group.title}>
                <h3 className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  {group.title}
                </h3>
                <ul className="mt-2 space-y-1">
                  {group.entries.map((entry) => (
                    <li key={entry.slug}>
                      <Link
                        to="/docs/$slug"
                        params={{ slug: entry.slug }}
                        className="text-xs leading-5 text-muted-foreground hover:text-foreground"
                      >
                        {entry.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
          <p className="mt-6 border-t border-border/70 pt-4 text-xs leading-5 text-muted-foreground">
            The versioned GRI v1.2 parent methodology and proof reference remains available at{" "}
            <a
              href="/docs/gri-architecture"
              className="text-primary underline underline-offset-4 hover:no-underline"
            >
              GRI Architecture &amp; Proof System
            </a>
            .
          </p>
        </details>
      </main>
    </div>
  );
}
