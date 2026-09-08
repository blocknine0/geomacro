import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, ListTree, Menu } from "lucide-react";
import { Wordmark } from "@/components/wordmark";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { DOCS_GROUPS, DOCS_PAGE_COUNT, type DocsPage } from "@/lib/docs-content";
import { cn } from "@/lib/utils";

function Contents({
  page,
  activeHeading,
  onNavigate,
}: {
  page?: DocsPage;
  activeHeading?: string | null;
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label="Documentation contents" className="text-sm">
      <p className="mb-3 border-b border-border/60 pb-3 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        Contents · {DOCS_PAGE_COUNT} pages
      </p>
      <div className="space-y-5">
        {DOCS_GROUPS.map((group) => (
          <div key={group.title}>
            <p className="mb-1 px-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70">
              {group.title}
            </p>
            <ol className="space-y-0.5">
              {group.entries.map((entry) => {
                const active = entry.slug === page?.slug;
                return (
                  <li key={entry.slug}>
                    <Link
                      to="/docs/$slug"
                      params={{ slug: entry.slug }}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex gap-2 rounded px-2 py-1.5 leading-snug transition-colors",
                        active
                          ? "bg-primary/10 font-medium text-foreground"
                          : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                      )}
                    >
                      <span className="w-6 shrink-0 tabular-nums text-[11px] text-muted-foreground/70">
                        {String(entry.page_number).padStart(2, "0")}
                      </span>
                      <span>{entry.title}</span>
                    </Link>
                    {active && page && page.headings.length > 0 ? (
                      <ul className="my-1 ml-8 space-y-0.5 border-l border-border pl-3">
                        {page.headings.map((heading) => (
                          <li key={heading.id}>
                            <a
                              href={`#${heading.id}`}
                              onClick={onNavigate}
                              className={cn(
                                "block rounded py-1 text-[13px] leading-snug transition-colors",
                                heading.level === 3 && "pl-3",
                                activeHeading === heading.id
                                  ? "text-primary"
                                  : "text-muted-foreground hover:text-foreground",
                              )}
                            >
                              {heading.text}
                            </a>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
      </div>
    </nav>
  );
}

export function DocumentHeader() {
  return (
    <header className="mb-7 border-b border-border pb-4">
      <Wordmark height={24} />
      <p className="mt-2 text-sm font-medium text-foreground">Global Risk Intelligence Infrastructure</p>
      <div className="mt-2 grid gap-x-6 gap-y-0.5 text-xs text-muted-foreground sm:grid-cols-2">
        <a href="https://geomacro.live" target="_blank" rel="noreferrer" className="hover:text-foreground">geomacro.live</a>
        <a href="mailto:contact@geomacro.live" className="hover:text-foreground">contact@geomacro.live</a>
        <span>Public Documentation</span>
        <span>September 2026</span>
      </div>
    </header>
  );
}

export function DocsLayout({ page, children }: { page: DocsPage; children: ReactNode }) {
  const [activeHeading, setActiveHeading] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    setActiveHeading(page.headings[0]?.id ?? null);
    if (!page.headings.length || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible?.target.id) setActiveHeading(visible.target.id);
      },
      { rootMargin: "-96px 0px -70% 0px", threshold: 0 },
    );
    for (const heading of page.headings) {
      const el = document.getElementById(heading.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [page.slug, page.headings]);

  return (
    <div className="w-full lg:grid lg:grid-cols-[288px_minmax(0,1fr)]">
      <aside className="hidden lg:sticky lg:top-16 lg:block lg:h-[calc(100vh-4rem)] lg:self-start lg:overflow-y-auto lg:border-r lg:border-border/60 lg:bg-background/60">
        <div className="px-5 py-8"><Contents page={page} activeHeading={activeHeading} /></div>
      </aside>

      <div className="min-w-0 px-4 py-8 md:px-10 lg:py-12">
        <div className="mb-6 flex items-center justify-between gap-3 lg:hidden">
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-foreground">
              <Menu className="h-4 w-4" aria-hidden /> Contents
            </SheetTrigger>
            <SheetContent side="left" className="w-[88vw] max-w-sm overflow-y-auto">
              <SheetTitle className="flex items-center gap-2 text-sm"><ListTree className="h-4 w-4" aria-hidden /> Documentation contents</SheetTitle>
              <div className="mt-4"><Contents page={page} activeHeading={activeHeading} onNavigate={() => setSheetOpen(false)} /></div>
            </SheetContent>
          </Sheet>
          <span className="text-xs tabular-nums text-muted-foreground">Page {page.page_number} of {DOCS_PAGE_COUNT}</span>
        </div>

        <article className="max-w-3xl">
          <DocumentHeader />
          <div className="mb-8 flex items-center justify-between gap-4 text-xs uppercase tracking-[0.18em] text-muted-foreground">
            <Link to="/docs" className="hover:text-foreground">Documentation</Link>
            <span className="tabular-nums">Page {page.page_number} of {DOCS_PAGE_COUNT}</span>
          </div>
          {children}
        </article>

        <div className="mt-12 max-w-3xl border-t border-border pt-6">
          <nav aria-label="Page navigation" className="grid gap-3 sm:grid-cols-2">
            {page.previousEntry ? (
              <Link to="/docs/$slug" params={{ slug: page.previousEntry.slug }} className="group rounded-md border border-border p-4 transition-colors hover:border-primary/50">
                <span className="flex items-center gap-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground"><ChevronLeft className="h-3 w-3" aria-hidden /> Previous</span>
                <span className="mt-1 block text-sm font-medium text-foreground">{page.previousEntry.title}</span>
              </Link>
            ) : <span />}
            {page.nextEntry ? (
              <Link to="/docs/$slug" params={{ slug: page.nextEntry.slug }} className="group rounded-md border border-border p-4 text-right transition-colors hover:border-primary/50 sm:col-start-2">
                <span className="flex items-center justify-end gap-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Next <ChevronRight className="h-3 w-3" aria-hidden /></span>
                <span className="mt-1 block text-sm font-medium text-foreground">{page.nextEntry.title}</span>
              </Link>
            ) : null}
          </nav>
          <footer className="mt-8 flex flex-col gap-1 border-t border-border pt-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>© 2026 Geomacro · geomacro.live · contact@geomacro.live</span>
            <span className="tabular-nums">Page {page.page_number} of {DOCS_PAGE_COUNT}</span>
          </footer>
        </div>
      </div>
    </div>
  );
}
