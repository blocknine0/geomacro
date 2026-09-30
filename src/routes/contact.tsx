import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowRight,
  Briefcase,
  ExternalLink,
  Github,
  LifeBuoy,
  Mail,
  Network,
  ShieldCheck,
} from "lucide-react";

const TITLE = "Contact Geomacro · Sales, Support, Integrations & Partnerships";
const DESCRIPTION =
  "Contact Geomacro for commercial access, customer support, institutional risk workflows, API integrations and strategic partnerships.";
const URL = "https://geomacro.live/contact";
const X_URL = "https://x.com/GeomacroLive";
const GITHUB_URL = "https://github.com/blocknine0/geomacro";
const EMAIL = "contact@geomacro.live";

const CONTACT_PATHS = [
  {
    icon: Briefcase,
    title: "Commercial access",
    text: "Evaluate Geomacro Intelligence, Risk Indices, Critical Minerals coverage or commercial machine delivery.",
    subject: "Geomacro commercial access",
  },
  {
    icon: Network,
    title: "API & agent integration",
    text: "Bring a country, corridor or machine workflow that needs governed risk context.",
    subject: "Geomacro API / integration discussion",
  },
  {
    icon: ShieldCheck,
    title: "Partnerships",
    text: "Discuss distribution, data, infrastructure, ecosystem or strategic collaboration.",
    subject: "Geomacro strategic partnership discussion",
  },
  {
    icon: LifeBuoy,
    title: "Customer support",
    text: "Report an access issue, unexpected output or product problem that needs human support.",
    subject: "Geomacro customer support",
  },
] as const;

export const Route = createFileRoute("/contact")({
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
  component: ContactPage,
});

function mailto(subject: string) {
  return `mailto:${EMAIL}?subject=${encodeURIComponent(subject)}`;
}

function ContactPage() {
  return (
    <main>
      <section className="relative overflow-hidden border-b border-border/55">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_82%_18%,color-mix(in_oklab,var(--primary)_12%,transparent),transparent_30%)]" />
        <div className="relative mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 sm:py-18 lg:py-22">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">Sales · support · integrations · partnerships</p>
          <h1 className="mt-4 max-w-4xl text-[clamp(2.8rem,6vw,5.5rem)] font-semibold leading-[0.96] tracking-[-0.05em]">Bring the workflow. We&apos;ll map the right Geomacro path.</h1>
          <p className="mt-6 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">The fastest conversation starts with the decision you are trying to improve, the geography or risk domain involved, and whether the output is for people or machines.</p>
          <a href={`mailto:${EMAIL}`} className="mt-7 inline-flex items-center gap-2 rounded-xl border border-primary/25 bg-primary/8 px-4 py-3 text-sm font-medium text-primary transition hover:bg-primary/12">
            <Mail className="h-4 w-4" /> {EMAIL}
          </a>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 sm:py-20">
        <div className="grid gap-4 md:grid-cols-2">
          {CONTACT_PATHS.map(({ icon: Icon, title, text, subject }) => (
            <article key={title} className="group rounded-2xl border border-border/60 bg-card/35 p-6 transition hover:-translate-y-0.5 hover:border-primary/30 hover:bg-card/55">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary"><Icon className="h-5 w-5" /></div>
              <h2 className="mt-5 text-xl font-semibold">{title}</h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{text}</p>
              <a href={mailto(subject)} className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline">
                Start conversation <ArrowRight className="h-4 w-4" />
              </a>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-border/55 bg-card/15">
        <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[.9fr_1.1fr]">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">For a useful commercial conversation</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">Four details are enough to start.</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ["01", "Decision", "What decision or review should Geomacro support?"],
              ["02", "Scope", "Which country, corridor, macro topic or critical-mineral exposure matters?"],
              ["03", "Delivery", "Human-facing intelligence, API, agent, Risk Object or Risk Gate?"],
              ["04", "Success", "What would make the evaluation useful enough to continue?"],
            ].map(([step, title, text]) => (
              <div key={step} className="rounded-xl border border-border/60 bg-background/30 p-5">
                <p className="font-mono text-[10px] text-primary">{step}</p>
                <p className="mt-2 text-sm font-semibold">{title}</p>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 sm:py-20">
        <div className="rounded-[1.5rem] border border-border/60 bg-card/30 p-6 sm:p-8 lg:flex lg:items-center lg:justify-between lg:gap-10">
          <div className="max-w-3xl">
            <p className="text-sm leading-7 text-muted-foreground"><span className="font-medium text-foreground">Commercial boundary:</span> Geomacro sells risk intelligence and governed machine-delivery capabilities. Prediction Markets, Bridge and Swap remain separate testnet technical proofs and are not part of the commercial mainnet product.</p>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">Do not send seed phrases, private keys, production secrets or unnecessary personal/confidential data by email.</p>
          </div>
          <div className="mt-6 flex shrink-0 gap-2 lg:mt-0">
            <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-border/70 px-3 py-2 text-sm hover:border-primary/40"><Github className="h-4 w-4" /> GitHub</a>
            <a href={X_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-border/70 px-3 py-2 text-sm hover:border-primary/40"><ExternalLink className="h-4 w-4" /> X</a>
          </div>
        </div>
      </section>
    </main>
  );
}
