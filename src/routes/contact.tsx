import { createFileRoute } from "@tanstack/react-router";
import { Briefcase, ExternalLink, Terminal } from "lucide-react";

const TITLE = "Contact Geomacro · Private Pilots & Partnerships";
const DESCRIPTION =
  "Talk with Geomacro about a focused Private Pilot, a technical integration, an institutional use case or a strategic partnership.";
const URL = "https://geomacro.live/contact";
const X_URL = "https://x.com/GeomacroLive";
const GITHUB_URL = "https://github.com/blocknine0/geomacro";
const EMAIL = "mailto:contact@geomacro.live";

export const Route = createFileRoute("/contact")({
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

const sections = [
  {
    icon: Briefcase,
    title: "Private Pilot or institutional use case",
    text: "Bring one real country, corridor, treasury or risk workflow. The first pilot should be narrow enough to measure whether Geomacro is useful in the process you already have.",
    cta: "Discuss a pilot",
    href: EMAIL,
  },
  {
    icon: Terminal,
    title: "Technical questions",
    text: "Review the risk architecture, intelligence pipeline, Risk Gate implementation and the separate Arc/Circle technical-proof work.",
    cta: "View on GitHub",
    href: GITHUB_URL,
  },
  {
    icon: ExternalLink,
    title: "Follow Geomacro",
    text: "Public research, product updates and announcements are posted on the official Geomacro X account.",
    cta: "Follow on X",
    href: X_URL,
  },
] as const;

function ContactPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
      <div className="max-w-3xl">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Contact</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">Bring a real risk workflow.</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
          If you are testing a treasury, payment, risk, supply-chain or software workflow, send the actual problem you want to evaluate. Technical and strategic conversations are welcome too.
        </p>
      </div>

      <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
        {sections.map((section) => {
          const Icon = section.icon;
          return (
            <article key={section.title} className="flex min-h-[240px] flex-col rounded-2xl border border-border/70 bg-card/40 p-6 transition hover:border-primary/30">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Icon className="h-4 w-4 text-primary" /> {section.title}
              </div>
              <p className="mt-3 flex-1 text-sm leading-relaxed text-muted-foreground">{section.text}</p>
              <a
                href={section.href}
                target={section.href.startsWith("mailto") ? undefined : "_blank"}
                rel={section.href.startsWith("mailto") ? undefined : "noreferrer"}
                className="mt-5 inline-flex min-h-10 items-center gap-2 self-start rounded-md border border-border/70 px-3 py-2 text-sm transition hover:border-primary/40 hover:text-foreground"
              >
                <ExternalLink className="h-3.5 w-3.5" /> {section.cta}
              </a>
            </article>
          );
        })}
      </div>

      <div className="mt-10 rounded-2xl border border-border/70 bg-card/30 p-5 text-sm leading-relaxed text-muted-foreground">
        <span className="font-medium text-foreground">Current stage:</span> Geomacro is founder-led, early-stage and focused on narrow Private Pilots. A conversation or access request becomes a commercial relationship only when it is separately agreed.
      </div>
    </main>
  );
}
