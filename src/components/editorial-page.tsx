import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
export type EditorialItem = { title: string; text: string; href?: string; label?: string };
export function EditorialPage({
  eyebrow,
  title,
  intro,
  items,
  note,
  children,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  items: EditorialItem[];
  note?: string;
  children?: React.ReactNode;
}) {
  return (
    <main className="gm-container py-12 sm:py-16">
      <header className="max-w-3xl">
        <p className="gm-eyebrow">{eyebrow}</p>
        <h1 className="gm-page-title">{title}</h1>
        <p className="gm-intro">{intro}</p>
      </header>
      <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-border bg-border md:grid-cols-2">
        {items.map((item, i) => (
          <section key={item.title} className="bg-background p-6 sm:p-8">
            <p className="font-mono text-xs text-primary">0{i + 1}</p>
            <h2 className="mt-4 text-xl font-semibold">
              {item.href?.startsWith("/") ? (
                <Link to={item.href as "/intelligence"} className="gm-heading-link group inline-flex items-center gap-2">
                  {item.title}<ArrowUpRight aria-hidden="true" className="h-4 w-4 shrink-0 text-primary opacity-60 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:opacity-100" />
                </Link>
              ) : item.href ? (
                <a href={item.href} className="gm-heading-link">{item.title}</a>
              ) : item.title}
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-7 text-muted-foreground">{item.text}</p>
            {item.href ? (
              <a href={item.href} className="gm-text-link mt-5">
                {item.label ?? "Explore"}
                <ArrowUpRight className="h-4 w-4" />
              </a>
            ) : null}
          </section>
        ))}
      </div>
      {note ? (
        <p className="mt-7 max-w-3xl text-xs leading-6 text-muted-foreground">{note}</p>
      ) : null}
      {children}
      <div className="mt-10 flex flex-wrap gap-5 border-t border-border pt-6">
        <Link to="/intelligence" className="gm-text-link">
          Explore intelligence <ArrowUpRight className="h-4 w-4" />
        </Link>
        <Link to="/pricing" className="gm-text-link">
          Visit Store <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>
    </main>
  );
}
