import { createFileRoute } from "@tanstack/react-router";
import { FeedSection } from "@/components/sections/feed-section";

const TITLE = "Risk Intelligence · Geomacro";
const DESCRIPTION =
  "Live geopolitical and macro risk intelligence with severity, confidence, evidence and structured context for professional and machine decision-making.";

export const Route = createFileRoute("/intelligence")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://geomacro.live/intelligence" },
    ],
    links: [{ rel: "canonical", href: "https://geomacro.live/intelligence" }],
  }),
  component: IntelligencePage,
});

function IntelligencePage() {
  return (
    <main>
      <section className="mx-auto max-w-7xl px-4 pb-3 pt-10 sm:px-6 sm:pt-12">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Live intelligence</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Risk Intelligence</h1>
        <p className="mt-3 max-w-3xl text-base leading-relaxed text-muted-foreground sm:text-lg">
          Follow the geopolitical and macro developments currently shaping risk. Each event is structured with severity, confidence and evidence so the same intelligence can support human research and machine workflows.
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          Reading intelligence does not require a wallet.
        </p>
      </section>
      <FeedSection />
    </main>
  );
}
