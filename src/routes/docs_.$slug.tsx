import { createFileRoute, notFound } from "@tanstack/react-router";
import { DocsLayout } from "@/components/docs/docs-layout";
import { DocsMarkdown } from "@/components/docs/docs-markdown";
import { DOCS_PAGE_COUNT, getDocsPage } from "@/lib/docs-content";

export const Route = createFileRoute("/docs_/$slug")({
  loader: ({ params }) => {
    const page = getDocsPage(params.slug);
    if (!page) throw notFound();
    return { page };
  },
  head: ({ params, loaderData }) => {
    const url = `https://geomacro.live/docs/${params.slug}`;
    if (!loaderData) {
      return { meta: [{ title: "Unavailable · Geomacro Documentation" }, { name: "robots", content: "noindex" }] };
    }
    const { page } = loaderData;
    const title = `${page.title} · Geomacro Documentation`;
    const description = `${page.title} — page ${page.page_number} of ${DOCS_PAGE_COUNT} of Geomacro's public documentation for geopolitical and macro risk intelligence.`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "article" },
        { property: "og:url", content: url },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [{
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "TechArticle",
          headline: page.title,
          url,
          description,
          isPartOf: { "@type": "WebSite", name: "Geomacro", url: "https://geomacro.live/" },
        }),
      }],
    };
  },
  component: DocsSlugPage,
  notFoundComponent: DocsNotFound,
});

function DocsSlugPage() {
  const { page } = Route.useLoaderData();
  return <DocsLayout page={page}><DocsMarkdown markdown={page.markdown} /></DocsLayout>;
}

function DocsNotFound() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-24 text-center">
      <h1 className="text-2xl font-semibold text-foreground">Documentation page not found</h1>
      <p className="mt-3 text-muted-foreground">This documentation page is unavailable. Return to the documentation index to browse the current public documentation.</p>
      <a href="/docs" className="mt-6 inline-block rounded-md border border-border px-4 py-2 text-sm text-foreground hover:border-primary/50">Go to documentation</a>
    </div>
  );
}
