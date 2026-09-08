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
          "Technical view of how Geomacro turns source evidence into structured intelligence, risk signals and downstream application artifacts. Current public GRI v1.2 scoring uses geopolitics, macro and rare-earth / critical-mineral risk.",
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
        description="This page exposes implementation detail behind the broader ingestion and processing system. The current public GRI v1.2 score uses three domains only: geopolitics, macro and rare-earth / critical-mineral risk. Other research or technical data streams must not be read as additional GRI scoring domains."
      />
      <PipelineSection />
    </>
  );
}