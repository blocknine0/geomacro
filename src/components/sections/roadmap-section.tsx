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
          text: "Compare structured intelligence products, signed Risk Gates and exact published prices.",
          href: "/pricing",
          label: "Browse Store",
        },
        {
          title: "Store & API access",
          text: "Explore machine-readable product tiers, signed Risk Gates and AI-agent JSON.",
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
