import { createFileRoute, Link } from "@tanstack/react-router";
import { Github, Info, Lock, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

const GITHUB_URL = "https://github.com/blocknine0/geomacro";
const TITLE = "About & Trust · Geomacro";
const DESCRIPTION =
  "How Geomacro builds explainable geopolitical and macro risk intelligence, what is live, what remains Private Pilot, and which trust boundaries are still explicit.";
const URL = "https://geomacro.live/about";

export const Route = createFileRoute("/about")({
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
  component: AboutPage,
});

function AboutPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
      <section className="max-w-3xl">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">About Geomacro</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">Risk intelligence built to be inspected, not just consumed.</h1>
        <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
          Geomacro turns geopolitical and macro developments into structured risk intelligence with evidence, confidence, versioned methodology and machine-readable decision context. The primary product is intelligence; prediction markets and Arc/Circle execution flows are secondary technical-proof layers.
        </p>
      </section>

      <section className="mt-12 grid gap-5 md:grid-cols-2">
        <article className="rounded-2xl border border-border/70 bg-card/50 p-6">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h2 className="mt-3 text-xl font-semibold">Current product status</h2>
          <ul className="mt-4 space-y-2 text-sm leading-relaxed text-muted-foreground">
            <li><span className="font-medium text-foreground">Live:</span> public risk intelligence, Global Risk Index and Ask Geomacro.</li>
            <li><span className="font-medium text-foreground">Private Pilot:</span> Risk Gate, signed Risk Objects and scoped API delivery.</li>
            <li><span className="font-medium text-foreground">Technical Proof:</span> Arc Testnet, USDC, prediction-market and programmable-finance implementation.</li>
          </ul>
        </article>

        <article className="rounded-2xl border border-border/70 bg-card/50 p-6">
          <Info className="h-5 w-5 text-primary" />
          <h2 className="mt-3 text-xl font-semibold">Transparency standard</h2>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            Geomacro documents methodology versions, provenance, confidence, change attribution and verification infrastructure. Public source-code visibility does not imply unrestricted open-source licensing; use and redistribution remain governed by the repository licence.
          </p>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 text-sm text-primary hover:underline">
            <Github className="h-4 w-4" /> View technical implementation
          </a>
        </article>

        <article className="rounded-2xl border border-border/70 bg-card/50 p-6">
          <Lock className="h-5 w-5 text-primary" />
          <h2 className="mt-3 text-xl font-semibold">Privacy and customer data</h2>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            Public intelligence browsing is designed to require minimal user information. Wallet interactions occur only when a user chooses a technical onchain flow. Private Pilot services may process authenticated client identifiers and the minimum operational context required to evaluate and audit a request; sensitive customer payload retention is deliberately minimized in the Risk Gate audit design.
          </p>
        </article>

        <article className="rounded-2xl border border-border/70 bg-card/50 p-6">
          <h2 className="text-xl font-semibold">Important boundaries</h2>
          <ul className="mt-4 space-y-2 text-sm leading-relaxed text-muted-foreground">
            <li>Geomacro intelligence is not financial, legal or investment advice.</li>
            <li>Risk Gate does not autonomously authorize or execute a customer's transaction.</li>
            <li>Independent external security review and full production SLA should not be inferred until completed.</li>
            <li>Testnet USDC and testnet market activity have no represented real-money settlement claim.</li>
          </ul>
        </article>
      </section>

      <section className="mt-12 rounded-2xl border border-border/70 bg-card/45 p-6 sm:p-8">
        <h2 className="text-2xl font-semibold">Explore Geomacro</h2>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button asChild><Link to="/intelligence">Risk Intelligence</Link></Button>
          <Button asChild variant="outline"><Link to="/global-risk">Global Risk Index</Link></Button>
          <Button asChild variant="outline"><Link to="/risk-gate">Risk Gate</Link></Button>
          <Button asChild variant="outline"><Link to="/docs">Documentation</Link></Button>
        </div>
      </section>
    </main>
  );
}
