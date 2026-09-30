import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Github, Info, Lock, ShieldCheck } from "lucide-react";
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
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: URL }],
  }),
  component: AboutPage,
});

function AboutPage() {
  return (
    <main>
      <section className="relative overflow-hidden border-b border-border/55">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_82%_18%,color-mix(in_oklab,var(--primary)_12%,transparent),transparent_30%)]" />
        <div className="relative mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 sm:py-18 lg:py-22">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">About & trust</p>
          <h1 className="mt-4 max-w-4xl text-[clamp(2.8rem,6vw,5.5rem)] font-semibold leading-[0.96] tracking-[-0.05em]">Trust the risk view because you can inspect its boundaries.</h1>
          <p className="mt-6 max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">Geomacro tracks geopolitical, macroeconomic and critical-mineral risk with confidence, change attribution and methodology context. We keep what is live, what is pilot and what is only technical proof clearly separated.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild variant="outline"><Link to="/research">Research & evidence</Link></Button>
            <Button asChild variant="outline"><Link to="/docs">Documentation</Link></Button>
            <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-lg border border-border/70 px-4 text-sm hover:border-primary/40"><Github className="h-4 w-4" /> GitHub</a>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 sm:py-20">
        <div className="grid gap-4 md:grid-cols-3">
          <StatusCard label="LIVE" title="Public intelligence" text="Risk Intelligence, separate Geopolitical, Macroeconomic and Critical Minerals Risk Indices, and Ask Geomacro." />
          <StatusCard label="PRIVATE PILOT" title="Controlled machine context" text="Risk Gate, signed country/directional-corridor Risk Objects and scoped commercial delivery." />
          <StatusCard label="TECHNICAL PROOF" title="Arc / Circle implementation" text="Testnet USDC, prediction-market and programmable-finance proof remains separate from the core commercial product." />
        </div>
      </section>

      <section className="border-y border-border/55 bg-card/15">
        <div className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 sm:py-20">
          <div className="max-w-3xl">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">Trust model</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">Evidence, methodology and responsibility stay visible.</h2>
          </div>
          <div className="mt-9 grid gap-4 md:grid-cols-2">
            <TrustCard icon={ShieldCheck} title="Explain the signal" text="Current readings preserve evidence context, confidence and change attribution instead of presenting an unsupported headline score." />
            <TrustCard icon={Info} title="Document the system" text="Methodology versions, provenance, confidence and verification details are documented so outputs can be reviewed and reproduced within their stated scope." />
            <TrustCard icon={Lock} title="Keep execution separate" text="Risk Gate remains non-authorizing. Customer identity, permissions, policy, funds and final execution stay outside Geomacro." />
            <TrustCard icon={Github} title="Make implementation inspectable" text="The public repository exposes technical implementation for review. Public visibility does not grant unrestricted reuse; repository and upstream rights still apply." />
          </div>
          <p className="mt-6 font-mono text-xs text-muted-foreground">execution_authorized=false</p>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 sm:py-20">
        <div className="max-w-3xl">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">What Geomacro does not claim</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">Decision context is not delegated authority.</h2>
        </div>
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            "Not financial, legal, compliance or investment advice.",
            "Risk Gate does not authorize or execute customer transactions.",
            "No independent external security certification or production SLA is claimed unless actually completed or contracted.",
            "Testnet USDC and Testnet market activity are not real-money production settlement.",
            "Customer policy and final execution remain customer-controlled.",
            "Prediction Markets, Bridge and Swap are separate technical proof, not the commercial risk-intelligence product.",
          ].map((item) => (
            <div key={item} className="rounded-xl border border-border/60 bg-card/30 p-4 text-sm leading-6 text-muted-foreground">{item}</div>
          ))}
        </div>
      </section>

      <section className="border-y border-border/55 bg-card/15">
        <div className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 sm:py-20">
          <div className="grid gap-4 lg:grid-cols-2">
            <details id="privacy" className="scroll-mt-24 rounded-2xl border border-border/60 bg-background/30 p-5 sm:p-6">
              <summary className="cursor-pointer list-none text-lg font-semibold">Privacy notice <span className="ml-2 text-xs font-normal text-muted-foreground">Open details</span></summary>
              <div className="mt-5 space-y-4 text-sm leading-7 text-muted-foreground">
                <p>Public intelligence can be viewed without an account or wallet. Standard hosting, security and operational infrastructure may process ordinary request metadata needed to deliver and protect the service.</p>
                <p>Interactive Testnet or pilot features can process information intentionally provided by the user, including verified wallet or credential metadata, usage records, payment references and structured feedback. Never send a seed phrase, private key or unnecessary confidential information.</p>
                <p>Private Pilot data minimization, retention, access and deletion requirements should be defined before sensitive business data is introduced.</p>
                <p>Privacy questions: <a href="mailto:contact@geomacro.live" className="text-primary hover:underline">contact@geomacro.live</a>.</p>
              </div>
            </details>

            <details id="product-use" className="scroll-mt-24 rounded-2xl border border-border/60 bg-background/30 p-5 sm:p-6">
              <summary className="cursor-pointer list-none text-lg font-semibold">Product use <span className="ml-2 text-xs font-normal text-muted-foreground">Open details</span></summary>
              <div className="mt-5 space-y-4 text-sm leading-7 text-muted-foreground">
                <p><span className="font-medium text-foreground">Public product:</span> informational risk intelligence that should be independently evaluated for the user&apos;s purpose.</p>
                <p><span className="font-medium text-foreground">Private Pilot and APIs:</span> access is governed by the scope actually agreed with the customer, including permitted use, support, security and data handling.</p>
                <p><span className="font-medium text-foreground">Technical proof:</span> Arc, Circle, CCTP, Bridge & Swap and prediction-market surfaces remain experimental or Testnet proof unless a page explicitly states otherwise.</p>
                <p><span className="font-medium text-foreground">Acceptable use:</span> do not bypass authentication, entitlement, rate-limit or security controls, misuse credentials, submit secrets through public forms or represent Geomacro output as an authorization it did not issue.</p>
              </div>
            </details>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 sm:py-20">
        <div className="overflow-hidden rounded-[1.75rem] border border-primary/20 bg-[linear-gradient(135deg,color-mix(in_oklab,var(--primary)_10%,transparent),transparent_58%)] p-6 sm:p-9 lg:flex lg:items-center lg:justify-between lg:gap-10">
          <div className="max-w-3xl">
            <h2 className="text-2xl font-semibold sm:text-3xl">Inspect the product from signal to methodology.</h2>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">Start with live intelligence, then go deeper into evidence, methodology or the controlled machine-delivery boundary.</p>
          </div>
          <div className="mt-7 flex shrink-0 flex-wrap gap-3 lg:mt-0">
            <Button asChild><Link to="/intelligence">Intelligence <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
            <Button asChild variant="outline"><Link to="/risk-gate">Risk Gate</Link></Button>
          </div>
        </div>
      </section>
    </main>
  );
}

function StatusCard({ label, title, text }: { label: string; title: string; text: string }) {
  return (
    <article className="rounded-2xl border border-border/60 bg-card/35 p-5 sm:p-6">
      <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-primary">{label}</p>
      <h2 className="mt-3 text-lg font-semibold">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
    </article>
  );
}

function TrustCard({ icon: Icon, title, text }: { icon: typeof ShieldCheck; title: string; text: string }) {
  return (
    <article className="rounded-2xl border border-border/60 bg-background/30 p-5 sm:p-6">
      <Icon className="h-5 w-5 text-primary" />
      <h3 className="mt-4 text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
    </article>
  );
}
