import { createFileRoute } from "@tanstack/react-router";
import { EditorialPage } from "@/components/editorial-page";
const TITLE = "Contact Geomacro · Sales, Support, Integrations & Partnerships";
const DESCRIPTION =
  "Contact Geomacro for commercial access, customer support, institutional risk workflows, API integrations and strategic partnerships.";
const URL = "https://geomacro.live/contact";
export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      {
        name: "robots",
        content: "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1",
      },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: URL },
      { property: "og:image", content: "https://geomacro.live/og-image-v2.png" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: URL }],
  }),
  component: ContactPage,
});

function ContactPage() {
  return (
    <EditorialPage
      eyebrow={"Contact"}
      title={"Let’s talk about your workflow."}
      intro={"Sales, support and integration enquiries: contact@geomacro.live."}
      items={[
        {
          title: "Product & launch access",
          text: "Tell us which product, geography and delivery format you need.",
          href: "mailto:contact@geomacro.live?subject=Geomacro%20launch%20access",
          label: "Email product enquiries",
        },
        {
          title: "API & agents",
          text: "Share the application or agent workflow you are building. API keys are coming soon.",
          href: "mailto:contact@geomacro.live?subject=Geomacro%20integration",
          label: "Email integrations",
        },
        {
          title: "Support",
          text: "Include the page, time and issue you saw so we can investigate.",
          href: "mailto:contact@geomacro.live?subject=Geomacro%20support",
          label: "Email support",
        },
        {
          title: "Partnerships",
          text: "Discuss research, distribution or a concrete collaboration.",
          href: "mailto:contact@geomacro.live?subject=Geomacro%20partnership",
          label: "Email partnerships",
        },
      ]}
      note={
        "Do not send private keys, seed phrases or production secrets. Find us on GitHub: github.com/blocknine0/geomacro and X: @GeomacroLive."
      }
    />
  );
}
