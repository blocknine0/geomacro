import { createFileRoute } from "@tanstack/react-router";
import { Briefcase, Terminal, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact · Geomacro" },
      {
        name: "description",
        content:
          "Discuss founding intelligence partnerships, private pilots, technical integrations, or strategic collaboration with Geomacro.",
      },
      { property: "og:title", content: "Contact · Geomacro" },
      {
        property: "og:description",
        content:
          "Discuss founding intelligence partnerships, private pilots, technical integrations, or strategic collaboration with Geomacro.",
      },
    ],
  }),
  component: ContactPage,
});

const X_URL = "https://x.com/GeomacroLive";
const GITHUB_URL = "https://github.com/blocknine0/geomacro";
const EMAIL = "mailto:contact@geomacro.live";

const sections = [
  {
    icon: Briefcase,
    title: "Founding Intelligence Partner",
    text: "Explore a founding pilot around country or corridor risk, institutional intelligence workflows, Risk API Private Pilot access, or Risk Gate evaluation.",
    cta: "Discuss a pilot",
    href: EMAIL,
  },
  {
    icon: Terminal,
    title: "Technical and Developer Questions",
    text: "Questions about the risk architecture, intelligence pipeline, onchain systems, or the GitHub repository.",
    cta: "View on GitHub",
    href: GITHUB_URL,
  },
  {
    icon: ExternalLink,
    title: "Official Geomacro X",
    text: "Follow product updates, public research, announcements, and ongoing Geomacro development.",
    cta: "Follow on X",
    href: X_URL,
  },
];

function ContactPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <div className="max-w-2xl">
        <h1 className="font-mono text-3xl tracking-tight">Get in touch</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          For founding intelligence partnerships, private pilots, technical integrations, or strategic conversations about Geomacro.
        </p>
      </div>

      <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
        {sections.map((s) => {
          const Icon = s.icon;
          return (
            <div
              key={s.title}
              className="rounded-lg border border-border/60 bg-card/40 p-6 transition hover:border-border"
            >
              <div className="flex items-center gap-2 text-sm font-mono text-primary">
                <Icon className="h-4 w-4" /> {s.title}
              </div>
              <p className="mt-3 text-sm text-muted-foreground">{s.text}</p>
              <a
                href={s.href}
                target={s.href.startsWith("mailto") ? undefined : "_blank"}
                rel={s.href.startsWith("mailto") ? undefined : "noreferrer"}
                className="mt-4 inline-flex items-center gap-2 rounded-md border border-border/60 px-3 py-2 text-sm font-mono transition hover:text-foreground hover:border-foreground/40"
              >
                <ExternalLink className="h-3.5 w-3.5" /> {s.cta}
              </a>
            </div>
          );
        })}
      </div>

      <p className="mt-12 text-center text-xs text-muted-foreground">
        Geomacro is founder-led and primarily built by its founder, with technical support and assistance on selected external conversations.
      </p>
    </main>
  );
}
