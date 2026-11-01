import { createFileRoute } from "@tanstack/react-router";
import { CommercialHome } from "@/components/home/commercial-home";
import { fetchDirectDerivedNews } from "@/lib/public-derived-news-client";
import { fetchDailyOfficialFinds } from "@/lib/home-daily-official-finds";
import { findCardFromObservedRelease } from "@/lib/find-card-v1";
import { withPublicRuntimeTimeout } from "@/lib/public-runtime-timeout";

const TITLE = "Geomacro | What changed. Why it matters.";
const DESCRIPTION =
  "Geomacro is a global intelligence platform for Geopolitics, Macro / FX and Critical Minerals. Read findings, ask questions and explore structured data for applications and AI agents.";
const URL = "https://geomacro.live/";
const IMAGE = "https://geomacro.live/og-image-v2.png";

export const Route = createFileRoute("/")({
  loader: async () => {
    // In-app Home navigation is instantaneous. The public Finds widget
    // already independently loads /api/v1/finds and the permitted static
    // fallback on mount; block only direct SSR on its bounded source read.
    if (typeof window !== "undefined") return { initialFindCards: [], initialDailyHighlights: [] };
    // Preferred zero-D1, original-dated, attributed official daily digest.
    // Unlike the capped latest feed, it can show accredited original releases
    // without silently stripping mandatory source credit.
    try {
      const signals=await withPublicRuntimeTimeout(fetchDailyOfficialFinds(),
        2_000,"Daily official highlights static read timed out.");
      if(signals.length>0)
        return {initialFindCards:[],initialDailyHighlights:signals};
    } catch { /* The legacy no-credit path stays as a bounded fallback. */ }
    // Bounded, static-only legacy Find Card fallback; no D1/Supabase reads.
    // Absence or outage leaves the homepage usable and never invents news.
    // Public client hydration can independently refresh the same feed.
    try {
      const signals = await withPublicRuntimeTimeout(
        fetchDirectDerivedNews(), 2_500, "Public Finds archive timed out.");
      const now=Date.now();
      return {initialFindCards:signals.map(s=>findCardFromObservedRelease(s,now))
        .filter((card)=>card!==null).slice(0,100),initialDailyHighlights:[]};
    } catch {
      return {initialFindCards:[],initialDailyHighlights:[]};
    }
  },
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { name: "robots", content: "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: URL },
      { property: "og:image", content: IMAGE },
      { property: "og:image:secure_url", content: IMAGE },
      { property: "og:image:alt", content: "Geomacro global risk intelligence infrastructure" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
      { name: "twitter:image", content: IMAGE },
      { name: "twitter:image:alt", content: "Geomacro global risk intelligence infrastructure" },
    ],
    links: [{ rel: "canonical", href: URL }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebApplication",
          "@id": "https://geomacro.live/#application",
          name: "Geomacro",
          url: URL,
          applicationCategory: "BusinessApplication",
          operatingSystem: "Web",
          inLanguage: "en",
          publisher: { "@id": "https://geomacro.live/#organization" },
          description: DESCRIPTION,
        }),
      },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const {initialFindCards,initialDailyHighlights}=Route.useLoaderData();
  return (
    <main>
      <CommercialHome initialFindCards={initialFindCards} initialDailyHighlights={initialDailyHighlights} />
    </main>
  );
}
