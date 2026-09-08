import { createFileRoute } from "@tanstack/react-router";
import { AskGeomacroSection } from "@/components/home/ask-geomacro";

const TITLE = "Ask Geomacro · Grounded Risk Intelligence";
const DESCRIPTION =
  "Ask geopolitical and macro risk questions grounded in Geomacro's stored evidence and canonical Global Risk Index.";

export const Route = createFileRoute("/ask-geomacro")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:url", content: "https://geomacro.live/ask-geomacro" },
    ],
    links: [{ rel: "canonical", href: "https://geomacro.live/ask-geomacro" }],
  }),
  component: AskPage,
});

function AskPage() {
  return (
    <main>
      <AskGeomacroSection standalone />
    </main>
  );
}
