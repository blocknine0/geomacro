import { createFileRoute } from "@tanstack/react-router";
import { TechnicalProofBanner } from "@/components/technical-proof-banner";

export const Route = createFileRoute("/arena")({
  head: () => ({
    meta: [
      { title: "Prediction Markets Paused · Geomacro" },
      {
        name: "description",
        content:
          "Geomacro Prediction Markets are temporarily paused. This surface remains permanently Testnet-only and is not planned for mainnet or real-money production use.",
      },
      { property: "og:title", content: "Prediction Markets Paused · Geomacro" },
      {
        property: "og:description",
        content: "Prediction-market runtime and background activity are currently disabled.",
      },
      { property: "og:url", content: "https://geomacro.live/arena" },
    ],
    links: [{ rel: "canonical", href: "https://geomacro.live/arena" }],
  }),
  component: PredictionMarketsPausedPage,
});

function PredictionMarketsPausedPage() {
  return (
    <>
      <TechnicalProofBanner
        title="Prediction Markets · Paused Testnet proof"
        description="This surface is permanently locked to Arc Testnet as secondary technical proof. Geomacro is not planning a prediction-market mainnet or real-money launch."
      />
      <section className="mx-auto w-full max-w-4xl px-4 py-20 sm:px-6">
        <div className="rounded-2xl border border-border bg-card/50 p-7 sm:p-10">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Paused technical proof</p>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">Prediction Markets are currently paused.</h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Prediction-market data polling, lifecycle automation, market creation, resolution, security monitoring, and briefing generation are disabled. This surface will remain inactive until Geomacro explicitly re-enables it.
          </p>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            The prediction-market application is not planned for mainnet or real-money production use. Geomacro&apos;s active product focus is geopolitical, macroeconomic, and critical-mineral risk intelligence.
          </p>
        </div>
      </section>
    </>
  );
}
