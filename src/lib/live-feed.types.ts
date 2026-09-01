import type { EventStage } from "./event-stage";

export const FEED_CATEGORIES = ["geopolitics", "rare-earth", "macro", "crypto"] as const;

export type FeedCategory = (typeof FEED_CATEGORIES)[number];

export type FeedEvent = {
  category: FeedCategory;
  narrative: string;
  summary: string;
  stage: EventStage;
  severity: number;
  confidence: number;
  delta: number;
  sourceUrl: string;
  sourceTitle: string;
  sourceName: string;
  publishedAt: string;
};
