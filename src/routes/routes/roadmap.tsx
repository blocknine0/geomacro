import { createFileRoute } from "@tanstack/react-router";
import { RoadmapSection } from "@/components/sections/roadmap-section";

export const Route = createFileRoute("/roadmap")({
  head: () => ({
    meta: [
      { title: "Roadmap · Geomacro" },
      { name: "description", content: "What Geomacro has shipped and what is coming next." },
      { property: "og:title", content: "Roadmap · Geomacro" },
      { property: "og:description", content: "Geomacro shipped milestones and upcoming work." },
      { property: "og:url", content: "https://geomacrooracle.lovable.app/roadmap" },
    ],
    links: [{ rel: "canonical", href: "https://geomacrooracle.lovable.app/roadmap" }],
  }),
  component: RoadmapSection,
});