import { createFileRoute, notFound } from "@tanstack/react-router";
import { DocsLayout } from "@/components/docs/docs-layout";
import { DocsMarkdown } from "@/components/docs/docs-markdown";
import { DOCS_PAGE_COUNT, getDocsPage } from "@/lib/docs-content";

const IMAGE = "https://geomacro.live/og-image-v2.png";

function stripMarkdown(value: string) {
  return value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/[|*_~]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateDescription(value: string, max = 158) {
  if (value.length <= max) return value;
  const sliced = value.slice(0, max - 1);
  const boundary = sliced.lastIndexOf(" ");
  return `${(boundary > 80 ? sliced.slice(0, boundary) : sliced).trim()}…`;
}

function docsDescription(markdown: string, title: string) {
  const paragraphs = markdown
    .split(/\n\s*\n/)
    .map(stripMarkdown)
    .filter((paragraph) => paragraph.length >= 45 && !paragraph.startsWith(title));

  const candidate = paragraphs[0] ?? `${title}. Geomacro public documentation for geopolitical and macro risk intelligence.`;
  return truncateDescription(candidate);
}

export const Route = createFileRoute("/docs_/$slug")({
  loader: ({ params }) => {
    const page = getDocsPage(params.slug);
    if (!page) throw notFound();
    return { page };
  },
  head: ({ params, loaderData }) => {
    const url = `https://geomacro.live/docs/${params.slug}`;
    if (!loaderData) {
      return {
        meta: [
          { title: "Unavailable · Geomacro Documentation" },
          { name: "robots", content: "noindex, follow, noarchive" },
        ],
      };
    }
    const { page } = loaderData;
    const title = `${page.title} · Geomacro Documentation`;
    const description = docsDescription(page.markdown, page.title);
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { name: "robots", content: "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "article" },
        { property: "og:url", content: url },
        { property: "og:image", content: IMAGE },
        { property: "og:image:secure_url", content: IMAGE },
        { property: "og:image:alt", content: `${page.title} · Geomacro documentation` },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        { name: "twitter:image", content: IMAGE },
        { name: "twitter:image:alt", content: `${page.title} · Geomacro documentation` },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "TechArticle",
            headline: page.title,
            url,
            mainEntityOfPage: url,
            description,
            inLanguage: "en",
            position: page.page_number,
            isPartOf: { "@id": "https://geomacro.live/#website" },
            publisher: { "@id": "https://geomacro.live/#organization" },
          }),
        },
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              {
                "@type": "ListItem",
                position: 1,
                name: "Geomacro",
                item: "https://geomacro.live/",
              },
              {
                "@type": "ListItem",
                position: 2,
                name: "Documentation",
                item: "https://geomacro.live/docs",
              },
              {
                "@type": "ListItem",
                position: 3,
                name: page.title,
                item: url,
              },
            ],
          }),
        },
      ],
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
