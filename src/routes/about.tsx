import { createFileRoute, Link } from "@tanstack/react-router";
import { Github, Info, Lock, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

const GITHUB_URL = "https://github.com/blocknine0/geomacro";
const TITLE = "About, Trust & Product Boundaries · Geomacro";
const DESCRIPTION =
  "How Geomacro builds geopolitical and macro risk intelligence, what is live today, what remains Private Pilot, and the privacy, security and product-use boundaries that apply.";
const URL = "https://geomacro.live/about";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { name: "robots", content: "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: URL },
      { property: "og:image", content: "https://geomacro.live/og-image-v2.png" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
    ],
    links: [{ rel: "canonical", href: URL }],
  }),
  component: AboutPage,
});

function AboutPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
      <section className="max-w-3xl">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">About & Trust</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">We show the evidence behind the risk view.</h1>
        <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
          Geomacro tracks geopolitical, macroeconomic and critical-mineral risk and shows the evidence, confidence, change attribution and methodology behind its readings. Risk intelligence is the product. Prediction markets and Arc/Circle flows remain separate technical proof.
        </p>
      </section>

      <section className="mt-12 grid gap-5 md:grid-cols-2">
        <article className="rounded-2xl border border-border/70 bg-card/50 p-6">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h2 className="mt-3 text-xl font-semibold">Current product status</h2>
          <ul className="mt-4 space-y-2 text-sm leading-relaxed text-muted-foreground">
            <li><span className="font-medium text-foreground">Live:</span> public Risk Intelligence, separate Geopolitical, Macroeconomic and Critical Minerals Risk Indices, and Ask Geomacro.</li>
            <li><span className="font-medium text-foreground">Private Pilot:</span> Risk Gate, signed country/directional-corridor Risk Objects and scoped commercial API delivery.</li>
            <li><span className="font-medium text-foreground">Technical Proof:</span> Arc Testnet, USDC, prediction-market and programmable-finance implementation.</li>
          </ul>
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            The separate public indices currently preserve the versioned GRI v1.2 parent methodology and verified proof lineage. Historical GRI references describe that versioned methodology and are not a second live headline index.
          </p>
        </article>

        <article className="rounded-2xl border border-border/70 bg-card/50 p-6">
          <Info className="h-5 w-5 text-primary" />
          <h2 className="mt-3 text-xl font-semibold">How we document the system</h2>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            Methodology versions, provenance, confidence, change attribution and verification details are documented so a risk result can be checked. The repository is publicly viewable, but public visibility does not grant unrestricted reuse; the repository licence and applicable rights still govern use.
          </p>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 text-sm text-primary hover:underline">
            <Github className="h-4 w-4" /> View technical implementation
          </a>
        </article>

        <article className="rounded-2xl border border-border/70 bg-card/50 p-6">
          <Lock className="h-5 w-5 text-primary" />
          <h2 className="mt-3 text-xl font-semibold">Security and customer-control boundary</h2>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            Geomacro uses server-side validation, authentication, rate limits, freshness checks, signature verification and audit records where the implemented surface supports them. These controls do not amount to an independent external security certification. Risk Gate remains non-authorizing and customer-controlled execution stays outside Geomacro.
          </p>
          <p className="mt-3 font-mono text-xs text-muted-foreground">execution_authorized=false</p>
        </article>

        <article className="rounded-2xl border border-border/70 bg-card/50 p-6">
          <h2 className="text-xl font-semibold">What Geomacro does not claim</h2>
          <ul className="mt-4 space-y-2 text-sm leading-relaxed text-muted-foreground">
            <li>Geomacro intelligence is not financial, legal, compliance or investment advice.</li>
            <li>Risk Gate does not authorize or execute a customer's transaction.</li>
            <li>Customer identity, permissions, policy, funds and final execution remain customer-controlled.</li>
            <li>There is no claim of an independent external security audit, certification or production SLA until one is actually completed or contracted.</li>
            <li>Testnet USDC and testnet market activity are not represented as real-money production settlement.</li>
          </ul>
        </article>
      </section>

      <section id="privacy" className="mt-12 scroll-mt-24 rounded-2xl border border-border/70 bg-card/45 p-6 sm:p-8">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Privacy notice</p>
        <h2 className="mt-3 text-2xl font-semibold">Collect only what the product needs.</h2>
        <div className="mt-5 space-y-4 text-sm leading-relaxed text-muted-foreground">
          <p>
            Public intelligence and research can be viewed without creating an account or connecting a wallet. Standard hosting, security and operational infrastructure may process ordinary request metadata needed to deliver and protect the service.
          </p>
          <p>
            Interactive Testnet features can process information you intentionally provide, such as a tester profile label, verified wallet address, API-credential metadata, usage records, Testnet payment references and structured feedback. Never send a seed phrase, private key or unnecessary confidential information.
          </p>
          <p>
            Private Pilot workflows may create server-side request, decision and audit records within the agreed scope. Data minimization, retention, access and deletion requirements should be defined with each pilot before sensitive business data is introduced. Geomacro does not claim a finalized enterprise data-processing programme where one has not yet been implemented or contracted.
          </p>
          <p>
            Privacy or data-handling questions can be sent to <a href="mailto:contact@geomacro.live" className="text-primary hover:underline">contact@geomacro.live</a>.
          </p>
        </div>
      </section>

      <section id="product-use" className="mt-6 scroll-mt-24 rounded-2xl border border-border/70 bg-card/45 p-6 sm:p-8">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Product use</p>
        <h2 className="mt-3 text-2xl font-semibold">Use Geomacro as decision context, not delegated authority.</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-border/60 bg-background/30 p-4">
            <h3 className="text-sm font-semibold">Public product</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Public intelligence, risk indices, research and documentation are informational risk-intelligence surfaces. They should be independently evaluated for the user's purpose and are not a substitute for professional legal, compliance, investment or sanctions advice.
            </p>
          </div>
          <div className="rounded-xl border border-border/60 bg-background/30 p-4">
            <h3 className="text-sm font-semibold">Private Pilot and APIs</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Pilot access is governed by the scope actually agreed with the customer. Pilot-specific commercial, permitted-use, support, security and data-handling terms take precedence over general website descriptions.
            </p>
          </div>
          <div className="rounded-xl border border-border/60 bg-background/30 p-4">
            <h3 className="text-sm font-semibold">Technical proof</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Arc, Circle, CCTP, Bridge & Swap and prediction-market surfaces are experimental or Testnet technical proof unless a page explicitly states otherwise. They must not be treated as real-money production execution.
            </p>
          </div>
          <div className="rounded-xl border border-border/60 bg-background/30 p-4">
            <h3 className="text-sm font-semibold">Acceptable use</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Do not attempt to bypass authentication, entitlement, rate-limit or security controls; misuse another user's credentials; submit secrets through public forms; or represent Geomacro output as an authorization Geomacro did not issue.
            </p>
          </div>
        </div>
      </section>

      <section className="mt-12 rounded-2xl border border-border/70 bg-card/45 p-6 sm:p-8">
        <h2 className="text-2xl font-semibold">Explore Geomacro</h2>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button asChild><Link to="/intelligence">Risk Intelligence</Link></Button>
          <Button asChild variant="outline"><Link to="/global-risk">Risk Indices</Link></Button>
          <Button asChild variant="outline"><Link to="/risk-gate">Risk Gate</Link></Button>
          <Button asChild variant="outline"><Link to="/docs">Documentation</Link></Button>
          <Button asChild variant="outline"><Link to="/contact">Contact</Link></Button>
        </div>
      </section>
    </main>
  );
}
