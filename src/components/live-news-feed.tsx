import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCcw, Radio } from "lucide-react";
import {
  FEED_CATEGORIES,
  type FeedCategory,
  type FeedEvent,
} from "@/lib/live-feed.types";
import { supabaseFeed } from "@/lib/supabase-feed";
import { formatDistanceToNowStrict } from "date-fns";

const CATEGORY_LABELS: Record<FeedCategory, string> = {
  geopolitics: "Geopolitics",
  "rare-earth": "Rare Earth",
  macro: "Macro",
};

const PUBLIC_FEED_COLUMNS = [
  "category",
  "narrative",
  "summary",
  "stage",
  "severity",
  "confidence",
  "delta",
  "published_at",
  "created_at",
].join(",");

type PublicFeedRow = {
  category: string;
  narrative: string;
  summary: string | null;
  stage: string;
  severity: number;
  confidence: number;
  delta: number;
  published_at: string;
  created_at: string;
};

function normalizeCategory(c: string): FeedCategory | null {
  const value = c.replace(/_/g, "-") as FeedCategory;
  return (FEED_CATEGORIES as readonly string[]).includes(value) ? value : null;
}

function rowToEvent(row: PublicFeedRow): FeedEvent | null {
  const category = normalizeCategory(row.category);
  if (!category) return null;
  const narrative = String(row.narrative ?? "").trim();
  if (narrative.length < 8) return null;
  const publishedMs = Date.parse(row.published_at);
  if (!Number.isFinite(publishedMs) || publishedMs < Date.now() - 7 * 24 * 60 * 60 * 1000) {
    return null;
  }
  return {
    category,
    narrative,
    summary: row.summary ?? "",
    stage: row.stage as FeedEvent["stage"],
    severity: row.severity,
    confidence: row.confidence,
    delta: row.delta,
    publishedAt: row.published_at,
  };
}

function severityClasses(severity: number) {
  if (severity > 70) return "text-destructive";
  if (severity >= 40) return "text-amber-400";
  return "text-emerald-400";
}

function StageBadge({ stage }: { stage: string }) {
  const tone =
    stage === "Active Escalation" ? "bg-destructive/15 text-destructive border-destructive/30" :
    stage === "Building" ? "bg-accent/15 text-accent border-accent/30" :
    stage === "Fragile Ceasefire" ? "bg-primary/15 text-primary border-primary/30" :
    "bg-muted text-muted-foreground border-border";
  return (
    <span className={`shrink-0 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider ${tone}`}>
      {stage}
    </span>
  );
}

export function LiveNewsFeed({
  onStatsChange,
}: {
  onStatsChange?: (stats: { count24h: number; total: number }) => void;
}) {
  const [active, setActive] = useState<FeedCategory | "all">("all");
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [, force] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const { data, error } = await supabaseFeed
        .from("events")
        .select(PUBLIC_FEED_COLUMNS)
        .order("published_at", { ascending: false, nullsFirst: false })
        .limit(50);
      if (error) throw error;
      const rows = (data ?? []) as unknown as PublicFeedRow[];
      const mapped = rows.map(rowToEvent).filter((event): event is FeedEvent => event !== null);
      setEvents(mapped);
      setLastUpdated(new Date());
      const since = Date.now() - 24 * 60 * 60_000;
      const count24h = rows.filter((row) => new Date(row.created_at).getTime() >= since).length;
      onStatsChange?.({ count24h, total: rows.length });
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Feed unavailable");
    } finally {
      setLoading(false);
    }
  }, [onStatsChange]);

  useEffect(() => {
    void load();
    const reload = setInterval(() => void load(), 30 * 60_000);
    const tick = setInterval(() => force((n) => n + 1), 60_000);
    return () => {
      clearInterval(reload);
      clearInterval(tick);
    };
  }, [load]);

  const filtered = useMemo(() => {
    const list = active !== "all" ? events.filter((event) => event.category === active) : events;
    return [...list].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  }, [active, events]);

  return (
    <div>
      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
          <button
            onClick={() => setActive("all")}
            className={`shrink-0 rounded-full border px-3 py-1.5 font-mono text-xs transition ${active === "all" ? "border-primary/60 bg-primary/10 text-primary" : "border-border/60 text-muted-foreground hover:text-foreground"}`}
          >
            All
          </button>
          {FEED_CATEGORIES.map((category) => (
            <button
              key={category}
              onClick={() => setActive(category)}
              className={`shrink-0 rounded-full border px-3 py-1.5 font-mono text-xs transition ${active === category ? "border-primary/60 bg-primary/10 text-primary" : "border-border/60 text-muted-foreground hover:text-foreground"}`}
            >
              {CATEGORY_LABELS[category]}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between gap-3 sm:justify-end">
          {lastUpdated && (
            <span className="font-mono text-[10px] text-muted-foreground">
              <Radio className="mr-1 inline h-3 w-3 text-primary" />
              Last updated: {formatDistanceToNowStrict(lastUpdated, { addSuffix: true })}
            </span>
          )}
          <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading} className="gap-1.5">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
            Refresh
          </Button>
        </div>
      </div>

      {err && (
        <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {err}
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        {loading && events.length === 0 ? (
          Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-44 animate-pulse rounded-2xl border border-border/40 bg-card/30" />
          ))
        ) : (
          filtered.map((event, index) => (
            <motion.article
              key={`${event.category}:${event.publishedAt}:${event.narrative.slice(0, 36)}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: index * 0.04 }}
              className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card/40 p-5 backdrop-blur transition hover:border-primary/40 sm:p-6"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
                    <Badge variant="outline" className="text-[10px]">{CATEGORY_LABELS[event.category]}</Badge>
                    <span className="text-muted-foreground/70">
                      {(() => {
                        const date = new Date(event.publishedAt);
                        return Number.isNaN(date.getTime())
                          ? event.publishedAt
                          : formatDistanceToNowStrict(date, { addSuffix: true });
                      })()}
                    </span>
                  </div>
                  <h3 className="mt-2 text-base font-medium leading-snug">{event.narrative}</h3>
                  {event.summary && (
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{event.summary}</p>
                  )}
                </div>
                <StageBadge stage={event.stage} />
              </div>

              <div className="mt-5 grid grid-cols-3 gap-3">
                <Metric label="Severity" value={event.severity} valueClassName={severityClasses(event.severity)} />
                <Metric label="Confidence" value={event.confidence} />
                <div>
                  <div className="font-mono text-xs text-muted-foreground">Risk Δ</div>
                  <div className={`mt-1 font-mono text-2xl tabular-nums ${event.delta >= 0 ? "text-accent" : "text-primary"}`}>
                    {event.delta >= 0 ? "+" : ""}{event.delta}
                  </div>
                </div>
              </div>

              <div className="mt-5 border-t border-border/60 pt-3 font-mono text-[10px] text-muted-foreground">
                Geomacro structured signal · decision support only
              </div>
            </motion.article>
          ))
        )}
        {!loading && filtered.length === 0 && !err && (
          <div className="col-span-full rounded-xl border border-dashed border-border/40 p-10 text-center text-sm text-muted-foreground">
            No live events in this category yet. Try Refresh.
          </div>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value, valueClassName }: { label: string; value: number; valueClassName?: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-xs text-muted-foreground">{label}</span>
        <span className={`font-mono text-xs tabular-nums ${valueClassName ?? ""}`}>{value}</span>
      </div>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-gradient-to-r from-primary to-accent" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}
