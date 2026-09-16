import { createFileRoute, Link } from "@tanstack/react-router";
import { Briefcase, ExternalLink, Github, Mail, Network, ShieldCheck } from "lucide-react";

const TITLE = "Contact Geomacro · Pilots, Integrations & Partnerships";
const DESCRIPTION =
  "Talk with Geomacro about professional access, a focused Private Pilot, institutional risk workflow, API/agent integration or strategic partnership.";
const URL = "https://geomacro.live/contact";
const X_URL = "https://x.com/GeomacroLive";
const GITHUB_URL = "https://github.com/blocknine0/geomacro";
const EMAIL = "contact@geomacro.live";
const PILOT_EMAIL = `mailto:${EMAIL}?subject=${encodeURIComponent("Geomacro Private Pilot discussion")}`;
const INTEGRATION_EMAIL = `mailto:${EMAIL}?subject=${encodeURIComponent("Geomacro API / agent integration discussion")}`;
const PARTNERSHIP_EMAIL = `mailto:${EMAIL}?subject=${encodeURIComponent("Geomacro strategic partnership discussion")}`;

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
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
    ],
    links: [{ rel: "canonical", href: URL }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "ContactPage",
          name: "Contact Geomacro",
          url: URL,
          description: DESCRIPTION,
          isPartOf: { "@type": "WebSite", name: "Geomacro", url: "https://geomacro.live/" },
        }),
      },
    ],
  }),
  component: ContactPage,
});

const contactPaths = [
  {
    icon: Briefcase,
    title: "Private Pilot or institutional evaluation",
    text: "Bring one real country, corridor, treasury, risk or supply-chain workflow. The pilot should be narrow enough to measure decision usefulness, data fit and operational friction.",
    cta: "Discuss a Private Pilot",
    href: PILOT_EMAIL,
  },
  {
    icon: Network,
    title: "API, agent or workflow integration",
    text: "Discuss governed data delivery, pay-per-call agent access, signed Risk Objects, Risk Gate or machine-readable integration for an existing product or internal workflow.",
    cta: "Discuss an integration",
    href: INTEGRATION_EMAIL,
  },
  {
    icon: ShieldCheck,
    title: "Strategic or ecosystem partnership",
    text: "For distribution, data, infrastructure, accelerator, grant or strategic collaboration where Geomacro's risk-intelligence layer may fit a broader platform.",
    cta: "Discuss a partnership",
    href: PARTNERSHIP_EMAIL,
  },
] as const;

const PILOT_DETAILS = [
  "Your organization or team and the workflow owner.",
  "The country, directional corridor or risk problem you want to evaluate.",
  "The decision point Geomacro would support, such as review, limit change, escalation or monitoring.",
  "What you use today and what is missing from that process.",
  "The interface you need: professional workspace, structured export, API, Risk Object, Risk Gate or agent access.",
  "How you would judge a useful pilot and the intended evaluation window.",
] as const;

function ContactPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
      <section className="max-w-3xl">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Contact</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">Bring a real risk workflow.</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
          The most useful conversation starts with a concrete decision, monitoring or integration problem. Geomacro is currently focused on controlled professional access, narrow Private Pilots and strategic integrations rather than broad self-serve enterprise onboarding.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3 text-sm">
          <a href={`mailto:${EMAIL}`} className="inline-flex items-center gap-2 font-medium text-primary hover:underline">
            <Mail className="h-4 w-4" /> {EMAIL}
          </a>
          <Link to="/agent-access" className="font-medium text-primary hover:underline">
            Compare access & pricing first
          </Link>
        </div>
      </section>

      <section className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
        {contactPaths.map((section) => {
          const Icon = section.icon;
          return (
            <article key={section.title} className="flex min-h-[260px] flex-col rounded-2xl border border-border/70 bg-card/40 p-6 transition hover:border-primary/30">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Icon className="h-4 w-4 text-primary" /> {section.title}
              </div>
              <p className="mt-3 flex-1 text-sm leading-relaxed text-muted-foreground">{section.text}</p>
              <a
                href={section.href}
                className="mt-5 inline-flex min-h-10 items-center gap-2 self-start rounded-md border border-border/70 px-3 py-2 text-sm transition hover:border-primary/40 hover:text-foreground"
              >
                <Mail className="h-3.5 w-3.5" /> {section.cta}
              </a>
            </article>
          );
        })}
      </section>

      <section className="mt-10 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <article className="rounded-2xl border border-border/70 bg-card/40 p-6 sm:p-8">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">For a useful first conversation</p>
          <h2 className="mt-3 text-2xl font-semibold">Include the workflow, not just the industry.</h2>
          <ul className="mt-5 space-y-3 text-sm leading-relaxed text-muted-foreground">
            {PILOT_DETAILS.map((item) => (
              <li key={item} className="flex gap-3">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
            Do not email seed phrases, private keys, production secrets or unnecessary personal/confidential data. Sensitive pilot data handling should be agreed before it is introduced.
          </p>
        </article>

        <article className="rounded-2xl border border-border/70 bg-card/40 p-6 sm:p-8">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Evaluation path</p>
          <h2 className="mt-3 text-2xl font-semibold">Scope first. Claims second.</h2>
          <ol className="mt-5 space-y-4 text-sm leading-relaxed text-muted-foreground">
            <li><span className="font-mono text-primary">01</span> Confirm the workflow and whether current Geomacro coverage can support it.</li>
            <li><span className="font-mono text-primary">02</span> Define the subject scope, evidence/data eligibility, interface and evaluation criteria.</li>
            <li><span className="font-mono text-primary">03</span> Agree commercial, support, security and data-handling boundaries before paid or sensitive access begins.</li>
          </ol>
        </article>
      </section>

      <section className="mt-10 flex flex-col justify-between gap-5 rounded-2xl border border-border/70 bg-card/30 p-5 sm:flex-row sm:items-center">
        <div className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">Current stage:</span> Geomacro is founder-led and early-stage. Public intelligence is live; professional/API/Risk Gate access is controlled; mainnet pay-per-call remains pre-launch. A conversation or access request becomes a commercial relationship only when separately agreed.
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-md border border-border/70 px-3 py-2 text-sm hover:border-primary/40">
            <Github className="h-4 w-4" /> GitHub
          </a>
          <a href={X_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-md border border-border/70 px-3 py-2 text-sm hover:border-primary/40">
            <ExternalLink className="h-4 w-4" /> X
          </a>
        </div>
      </section>
    </main>
  );
}
