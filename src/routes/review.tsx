import { createFileRoute } from "@tanstack/react-router";

const TITLE = "Independent Review | Geomacro";
const DESCRIPTION =
  "Test Geomacro's evidence-driven geopolitical and macro risk intelligence, agent risk controls, data pipeline and onchain flows. Honest technical feedback is welcome.";
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
    title: "2. Data Pipeline",
    href: "/pipeline",
    copy: "Review how Geomacro represents ingestion, normalization, deduplication, classification and scoring. Tell us whether the process is understandable without knowing the internal architecture.",
  },
  {
    title: "3. Agent Demo",
    href: "/arena",
    copy: "Inspect how risk intelligence is evaluated before an autonomous agent is allowed to continue an onchain action. Judge whether the decision and supporting evidence are understandable.",
  },
  {
    title: "4. Bridge & Swap",
    href: "/bridge-swap",
    copy: "If you are comfortable with Web3 testnets, test wallet connection, network switching, estimates and transaction flows. Please report any wallet, parameter, network or fee error exactly as shown.",
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
            Geomacro is an evidence-driven geopolitical and macro risk intelligence platform for humans, developers and autonomous agents. We are inviting a small group of builders, analysts and technical testers to independently test the product.
          </p>
          <div className="mt-5 rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm leading-6">
            This is not a request for a positive review. We want honest feedback, including anything that breaks, feels unclear or should be improved.
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
            Some onchain surfaces are testnet or demo experiences while Geomacro's intelligence and API surfaces may be production-facing. Reviewers should judge each surface according to the environment label shown in the product and report any place where that distinction is unclear.
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
