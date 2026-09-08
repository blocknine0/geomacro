import { createFileRoute } from "@tanstack/react-router";
import { EventDetailWorkspace } from "@/components/intelligence/event-detail-workspace";

export const Route = createFileRoute("/event/$eventId")({
  head: ({ params }) => {
    const canonical = `https://geomacro.live/event/${encodeURIComponent(params.eventId)}`;
    return {
      meta: [
        { title: "Intelligence Event · Geomacro" },
        {
          name: "description",
          content:
            "Stored Geomacro intelligence event with source context, risk score, confidence and provenance timestamps.",
        },
        { property: "og:title", content: "Intelligence Event · Geomacro" },
        {
          property: "og:description",
          content:
            "Inspect the stored evidence and risk context behind a Geomacro intelligence event.",
        },
        { property: "og:url", content: canonical },
        { property: "og:type", content: "article" },
      ],
      links: [{ rel: "canonical", href: canonical }],
    };
  },
  component: EventDetailPage,
});

function EventDetailPage() {
  const { eventId } = Route.useParams();
  return <EventDetailWorkspace eventId={eventId} />;
}
