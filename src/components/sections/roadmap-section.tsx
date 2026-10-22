import { EditorialPage } from "@/components/editorial-page";
export function RoadmapSection() {
  return (
    <EditorialPage
      eyebrow="Roadmap"
      title="Use it today. See what’s next."
      intro="Public intelligence now. Structured commercial access next."
      items={[
        {
          title: "Explore today",
          text: "Read Geomacro Finds, inspect available Risk Indices and ask a public research question.",
          href: "/intelligence",
          label: "Open intelligence",
        },
        {
          title: "Store catalog",
          text: "Compare products and exact USDC prices. Self-service checkout is coming soon.",
          href: "/pricing",
          label: "Browse Store",
        },
        {
          title: "API keys · Coming soon",
          text: "Self-service keys will follow launch readiness. Scoped pilot integrations remain available by agreement.",
          href: "/data-api",
          label: "Explore API & Agents",
        },
        {
          title: "Marketplace listings · Planned",
          text: "API and AI-agent distribution follows verified commercial launch.",
          href: "/contact",
          label: "Discuss an integration",
        },
      ]}
      note="Catalog publication does not activate payments or promise a launch date. Each commercial request needs its own eligible result and payment quote."
    />
  );
}
