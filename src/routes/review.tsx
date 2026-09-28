import { createFileRoute } from "@tanstack/react-router";

const TITLE = "Independent Review | Geomacro";
const DESCRIPTION =
  "Test Geomacro's evidence-driven geopolitical and macro risk intelligence, risk controls and governed data pipeline. Honest technical feedback is welcome.";
const URL = "https://geomacro.live/review";

export const Route = createFileRoute("/review")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { name: "robots", content: "index, follow" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: URL },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
    ],
    links: [{ rel: "canonical", href: URL }],
  }),
  component: ReviewPage,
});

const testFlows = [
  {
    title: "1. Ask Geomacro",
    href: "/ask-geomacro",
    copy: "Ask a real geopolitical, macroeconomic, trade, sanctions, supply-chain or market-risk question. Check the direct answer, risk drivers, confidence, verification status and supporting evidence.",
  },
  {
    title: "2. Risk Indices",
    href: "/global-risk",
    copy: "Review the separate geopolitical, macroeconomic and critical-minerals risk views. Check whether the signals, evidence and methodology boundaries are understandable and decision-useful.",
  },
  {
    title: "3. Risk Gate",
    href: "/risk-gate",
    copy: "Inspect how Geomacro turns governed risk intelligence into controlled decision context. Judge whether the reasoning, evidence and current Private Pilot boundary are clear.",
  },
  {
    title: "4. Data & API",
    href: "/data-api",
    copy: "Review the machine-readable delivery surface, public data and API status. Tell us whether the data model, access boundary and intended use are clear to a technical buyer or integrator.",
  },
  {
    title: "5. Research & Evidence",
    href: "/research",
    copy: "Review methodology, coverage evidence, limitations and proof lineage. We especially want feedback on whether claims are supported clearly enough for serious risk work.",
  },
  {
    title: "6. Data Pipeline",
    href: "/pipeline",
    copy: "Review how Geomacro represents ingestion, normalization, deduplication, classification and scoring. This is supporting technical proof, not the commercial product itself.",
  },
];

function ReviewPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <section className="space-y-6">
        <div className="rounded-xl border border-border/60 bg-card/40 p-6 sm:p-8">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Independent testing</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Help test Geomacro before commercial launch</h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
            Geomacro is an evidence-driven geopolitical and macro risk intelligence product for human and machine decision systems. We are inviting a small group of builders, analysts and technical testers to independently test the core intelligence product.
          </p>
          <div className="mt-5 rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm leading-6">
            This is not a request for a positive review. We want honest feedback, including anything that breaks, feels unclear or should be improved.
          </div>
          <div className="mt-4 rounded-lg border border-border/60 bg-muted/20 p-4 text-sm leading-6 text-muted-foreground">
            Product boundary: Prediction Markets, Bridge and Swap are separate testnet technical proofs. They are not part of Geomacro's commercial mainnet product and are intentionally excluded from this reviewer flow.
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {testFlows.map((flow) => (
            <a key={flow.title} href={flow.href} className="rounded-xl border border-border/60 bg-card/30 p-5 transition hover:bg-card/60">
              <h2 className="font-medium">{flow.title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{flow.copy}</p>
              <p className="mt-4 text-xs font-medium">Open test flow →</p>
            </a>
          ))}
        </div>

        <div className="rounded-xl border border-border/60 bg-card/40 p-6 sm:p-8">
          <h2 className="text-xl font-semibold">What we want to know</h2>
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-6 text-muted-foreground">
            <li>What part of Geomacro was most useful?</li>
            <li>What was confusing?</li>
            <li>Did anything break?</li>
            <li>Would you use any part of the product yourself?</li>
            <li>What is the single most important thing we should improve before commercial launch?</li>
          </ol>
          <p className="mt-5 text-sm leading-6 text-muted-foreground">
            Technical criticism is welcome. Useful negative feedback will be treated as product evidence, not hidden or discouraged.
          </p>
        </div>

        <div className="rounded-xl border border-border/60 bg-muted/20 p-6 sm:p-8">
          <h2 className="text-xl font-semibold">Environment clarity</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Geomacro's commercial identity is risk intelligence. Supporting testnet and technical-proof surfaces are deliberately separated from the main product experience so users can distinguish production-facing intelligence from experimental onchain demonstrations.
          </p>
          <div className="mt-5 flex flex-wrap gap-3 text-sm">
            <a className="underline underline-offset-4" href="https://github.com/blocknine0/geomacro" target="_blank" rel="noreferrer">GitHub</a>
            <a className="underline underline-offset-4" href="/roadmap">Roadmap</a>
            <a className="underline underline-offset-4" href="/docs/01-what-is-geomacro">Documentation</a>
          </div>
        </div>
      </section>
    </main>
  );
}
