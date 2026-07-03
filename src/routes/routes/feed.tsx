import { createFileRoute } from "@tanstack/react-router";
import { FeedSection } from "@/components/sections/feed-section";

export const Route = createFileRoute("/feed")({
  head: () => ({
    meta: [
      { title: "Terminal · Geomacro" },
      { name: "description", content: "Live geopolitics, commodities, macro and crypto headlines with severity, confidence and stage scores from the Geomacro pipeline." },
      { property: "og:title", content: "Terminal · Geomacro" },
      { property: "og:description", content: "Live geopolitics, commodities, macro and crypto headlines scored by Geomacro." },
      { property: "og:url", content: "https://geomacrooracle.lovable.app/feed" },
    ],
    links: [{ rel: "canonical", href: "https://geomacrooracle.lovable.app/feed" }],
  }),
  component: FeedSection,
});