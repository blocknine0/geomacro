import { LiveNewsFeed } from "@/components/live-news-feed";
import { SectionHeader } from "@/components/section-ui";

export function FeedSection() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 md:py-24">
      <SectionHeader
        eyebrow="GLOBAL TERMINAL FEED"
        title="The live signal layer behind Geomacro risk intelligence"
        desc="A real-time intelligence stream across geopolitics, critical-mineral supply chains and macroeconomics. Each event carries structured stage, severity and confidence context for monitoring, research and downstream intelligence workflows."
      />
      <div className="mt-12">
        <LiveNewsFeed />
      </div>
    </section>
  );
}
