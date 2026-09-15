import { createFileRoute } from "@tanstack/react-router";
import { EventDetailWorkspace } from "@/components/intelligence/event-detail-workspace";
import { getPublicEventSeoDetail } from "@/lib/public-event-seo.functions";

const IMAGE = "https://geomacro.live/og-signal-card-v2.png";

function cleanMetaText(value: string | null | undefined, fallback: string, max = 158) {
  const clean = (value ?? fallback).replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const sliced = clean.slice(0, max - 1);
  const boundary = sliced.lastIndexOf(" ");
  return `${(boundary > 80 ? sliced.slice(0, boundary) : sliced).trim()}…`;
}

function eventPageTitle(value: string | null | undefined) {
  const eventTitle = cleanMetaText(value, "Intelligence Event", 58);
  return `${eventTitle} | Geomacro Risk Intelligence`;
}

export const Route = createFileRoute("/event/$eventId")({
  loader: ({ params }) => getPublicEventSeoDetail({ data: { eventId: params.eventId } }),
  head: ({ params, loaderData }) => {
    const canonical = `https://geomacro.live/event/${encodeURIComponent(params.eventId)}`;
    if (!loaderData) {
      return {
        meta: [
          { title: "Intelligence Event | Geomacro" },
          {
            name: "description",
            content: "Geomacro public geopolitical and macro risk intelligence event.",
          },
          { name: "robots", content: "noindex, follow, noarchive" },
          { property: "og:url", content: canonical },
        ],
        links: [{ rel: "canonical", href: canonical }],
      };
    }

    const title = eventPageTitle(loaderData.source_title);
    const description = cleanMetaText(
      loaderData.summary ?? loaderData.narrative,
      "Inspect the stored evidence, risk score, confidence, timestamps and structured context behind a Geomacro intelligence event.",
    );
    const published = loaderData.published_at ?? loaderData.created_at;

    return {
      meta: [
        { title },
        { name: "description", content: description },
        { name: "robots", content: "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: canonical },
        { property: "og:type", content: "article" },
        { property: "og:image", content: IMAGE },
        { property: "og:image:secure_url", content: IMAGE },
        { property: "og:image:width", content: "1200" },
        { property: "og:image:height", content: "630" },
        { property: "og:image:alt", content: "Geomacro geopolitical and macro risk intelligence" },
        { property: "article:published_time", content: published },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        { name: "twitter:image", content: IMAGE },
        { name: "twitter:image:alt", content: "Geomacro geopolitical and macro risk intelligence" },
      ],
      links: [{ rel: "canonical", href: canonical }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: cleanMetaText(loaderData.source_title, "Geomacro Intelligence Event", 110),
            description,
            url: canonical,
            mainEntityOfPage: canonical,
            datePublished: published,
            articleSection: loaderData.category ?? "Risk Intelligence",
            inLanguage: "en",
            image: IMAGE,
            publisher: { "@id": "https://geomacro.live/#organization" },
            isPartOf: { "@id": "https://geomacro.live/#website" },
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
                name: "Risk Intelligence",
                item: "https://geomacro.live/intelligence",
              },
              {
                "@type": "ListItem",
                position: 3,
                name: cleanMetaText(loaderData.source_title, "Intelligence Event", 80),
                item: canonical,
              },
            ],
          }),
        },
      ],
    };
  },
  component: EventDetailPage,
});

function EventDetailPage() {
  const { eventId } = Route.useParams();
  const event = Route.useLoaderData();
  return <EventDetailWorkspace eventId={eventId} initialEvent={event} />;
}
