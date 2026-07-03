import { createFileRoute } from "@tanstack/react-router";
import { PipelineSection } from "@/components/sections/pipeline-section";

export const Route = createFileRoute("/pipeline")({
  head: () => ({
    meta: [
      { title: "Pipeline · Geomacro" },
      { name: "description", content: "The ten stages between a raw headline hitting the wire and a signed event landing on Arc." },
      { property: "og:title", content: "Pipeline · Geomacro" },
      { property: "og:description", content: "How Geomacro turns raw headlines into signed onchain events, step by step." },
      { property: "og:url", content: "https://geomacrooracle.lovable.app/pipeline" },
    ],
    links: [{ rel: "canonical", href: "https://geomacrooracle.lovable.app/pipeline" }],
  }),
  component: PipelineSection,
});