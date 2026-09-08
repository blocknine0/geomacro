import { createFileRoute } from "@tanstack/react-router";
import { PipelineSection } from "@/components/sections/pipeline-section";
import { TechnicalProofBanner } from "@/components/technical-proof-banner";

export const Route = createFileRoute("/pipeline")({
  head: () => ({
    meta: [
      { title: "Intelligence Pipeline · Technical Detail · Geomacro" },
      {
        name: "description",
        content:
          "Technical view of how Geomacro turns source evidence into structured intelligence, risk signals and downstream application artifacts.",
      },
      { property: "og:title", content: "Intelligence Pipeline · Technical Detail · Geomacro" },
      {
        property: "og:description",
        content:
          "Technical pipeline behind Geomacro evidence ingestion, structured risk intelligence and secondary application outputs.",
      },
      { property: "og:url", content: "https://geomacro.live/pipeline" },
    ],
    links: [{ rel: "canonical", href: "https://geomacro.live/pipeline" }],
  }),
  component: PipelineTechnicalPage,
});

function PipelineTechnicalPage() {
  return (
    <>
      <TechnicalProofBanner
        title="Intelligence Pipeline"
        description="This page exposes implementation detail behind the intelligence system. Public commercial surfaces explain the product first; this route keeps deeper pipeline mechanics available for technical review."
      />
      <PipelineSection />
    </>
  );
}
