import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { DocumentHeader } from "@/components/docs/docs-layout";
import { DOCS_GROUPS, DOCS_MANIFEST, DOCS_PAGE_COUNT } from "@/lib/docs-content";

const TITLE = "Documentation · Geomacro";
const DESCRIPTION =
  "Public documentation for Geomacro's geopolitical and macro risk intelligence infrastructure: evidence, GRI methodology, change attribution, Risk Objects, Risk Gate, data governance, reliability and technical proof.";

export const Route = createFileRoute("/docs")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://geomacro.live/docs" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://geomacro.live/docs" }],
    scripts: [{
      type: "application/ld+json",
      children: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "TechArticle",
        headline: "Geomacro Documentation",
        url: "https://geomacro.live/docs",
        description: DESCRIPTION,
        isPartOf: { "@type": "WebSite", name: "Geomacro", url: "https://geomacro.live/" },
      }),
    }],
  }),
  component: DocsIndexPage,
});

const ENTRY_SLUGS = [
  "01-what-is-geomacro",
  "16-double-counting-protection",
  "22-machine-readable-risk-objects",
  "24-access-levels-free-to-institutional",
  "28-partner-architecture",
  "34-prediction-markets",
] as const;

function DocsIndexPage() {
  const entryCards = ENTRY_SLUGS.map((slug) => DOCS_MANIFEST.find((entry) => entry.slug === slug)).filter(Boolean);
  const first = DOCS_MANIFEST[0];

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:py-14">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
        <main className="min-w-0 max-w-3xl">
          <DocumentHeader />
          <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">Geomacro public documentation</h1>
          <p className="mt-4 leading-7 text-muted-foreground">
            Geomacro is geopolitical and macro risk intelligence infrastructure. These documents explain how evidence becomes structured intelligence, how the Global Risk Index is calculated and verified, how machine-readable Risk Objects and Risk Gate work, and which product surfaces are live, Private Pilot, technical proof or planned.
          </p>
          <p className="mt-4 leading-7 text-muted-foreground">
            Prediction markets, Arc Testnet, CCTP, Bridge & Swap and smart-contract execution are documented as secondary technical-proof layers, not as Geomacro's primary commercial identity.
          </p>

          <div className="mt-8 rounded-lg border border-border bg-card/30 p-4">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Intelligence flow</p>
            <ol className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-2 text-xs">
              {["Real-world events", "Structured signals", "Global Risk Index", "Change attribution", "Risk Objects / Risk Gate"].map((step, index, all) => (
                <li key={step} className="flex items-center gap-2">
                  <span className="rounded border border-border bg-background/60 px-2.5 py-1.5 text-foreground">{step}</span>
                  {index < all.length - 1 ? <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/60" aria-hidden /> : null}
                </li>
              ))}
            </ol>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {entryCards.map((entry) => entry ? (
              <Link key={entry.slug} to="/docs/$slug" params={{ slug: entry.slug }} className="group rounded-lg border border-border bg-card/30 p-4 transition-colors hover:border-primary/50">
                <p className="text-sm font-semibold text-foreground">{entry.title}</p>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">Page {entry.page_number} of {DOCS_PAGE_COUNT}</p>
              </Link>
            ) : null)}
          </div>

          <Link to="/docs/$slug" params={{ slug: first.slug }} className="mt-8 inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/50">
            Start reading <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>

          <p className="mt-12 border-t border-border pt-6 text-sm text-muted-foreground">
            The canonical current GRI proof reference remains available at <a href="/docs/gri-architecture" className="text-primary underline underline-offset-4 hover:no-underline">GRI Architecture & Proof System</a>.
          </p>
        </main>

        <aside className="rounded-xl border border-border/60 bg-card/20 p-5 lg:sticky lg:top-20 lg:self-start">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Complete contents · {DOCS_PAGE_COUNT} pages</p>
          <div className="mt-5 max-h-[70vh] space-y-5 overflow-y-auto pr-1">
            {DOCS_GROUPS.map((group) => (
              <div key={group.title}>
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70">{group.title}</p>
                <div className="mt-1 space-y-1">
                  {group.entries.map((entry) => (
                    <Link key={entry.slug} to="/docs/$slug" params={{ slug: entry.slug }} className="flex gap-2 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted/40 hover:text-foreground">
                      <span className="w-6 shrink-0 tabular-nums">{String(entry.page_number).padStart(2, "0")}</span>
                      <span>{entry.title}</span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
