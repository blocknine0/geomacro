import { createFileRoute } from "@tanstack/react-router";
import { Github, ShieldCheck, Info, Lock } from "lucide-react";

const GITHUB_URL = "https://github.com/blocknine0/geomacro";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About & Trust · Geomacro" },
      {
        name: "description",
        content:
          "Geomacro is geopolitical and macro risk intelligence infrastructure with explainable GRI, structured intelligence, agent-facing services and secondary programmable execution.",
      },
      { property: "og:title", content: "About & Trust · Geomacro" },
      {
        property: "og:description",
        content:
          "Explainable geopolitical and macro risk intelligence with verifiable GRI methodology, commercial intelligence services and secondary Arc Testnet execution infrastructure.",
      },
    ],
  }),
  component: AboutPage,
});

function AboutPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="font-mono text-3xl tracking-tight">About & Trust</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        This page is maintained by the Geomacro project to answer common questions about what
        the app does, what it doesn't do and how data is handled.
      </p>

      <section className="mt-10 space-y-6">
        <div className="rounded-lg border border-border/60 bg-card/40 p-6">
          <div className="flex items-center gap-2 text-sm font-mono text-primary">
            <ShieldCheck className="h-4 w-4" /> Commercial intelligence, Testnet execution
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Geomacro's primary product is geopolitical and macro risk intelligence.
            GRI, structured intelligence, Risk API, Risk Gate and agent-facing intelligence
            are designed as commercial software services and are not limited to Arc Testnet.
            Commercial access may use conventional fiat billing, including INR where supported,
            or production digital-asset payment rails such as USDC as those integrations are
            enabled and compliant.

            Current prediction-market and programmable smart-contract interactions run on{" "}
            <span className="font-mono text-foreground">Arc Testnet (Chain 5042002)</span> and
            use <span className="font-mono text-foreground">test USDC</span> with no monetary
            value. These Testnet execution flows are secondary to the intelligence product.
            Geomacro intelligence should not be treated as financial advice.
          </p>
        </div>

        <div className="rounded-lg border border-border/60 bg-card/40 p-6">
          <div className="flex items-center gap-2 text-sm font-mono text-primary">
            <Lock className="h-4 w-4" /> Privacy
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            We do not collect personal data. The app interacts with your wallet only to read
            your address and request signatures for on-chain transactions you initiate. Wallet
            addresses and transaction history are already public on the Arc Testnet ledger;
            we don't ask for, store or transmit any additional personal information.
          </p>
        </div>

        <div className="rounded-lg border border-border/60 bg-card/40 p-6">
          <div className="flex items-center gap-2 text-sm font-mono text-primary">
            <Info className="h-4 w-4" /> Transparency
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Geomacro publishes auditable implementation details, smart-contract code, methodology documentation and verification infrastructure through its repository. Source availability does not imply unrestricted open-source licensing; use and redistribution are governed by the repository's applicable license terms.
          </p>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-2 rounded-md border border-border/60 px-3 py-2 text-sm font-mono transition hover:text-foreground hover:border-foreground/40"
          >
            <Github className="h-4 w-4" /> View on GitHub
          </a>
        </div>
      </section>
    </main>
  );
}