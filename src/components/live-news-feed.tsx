import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCcw, Radio } from "lucide-react";
import {
  fetchLiveFeed,
  FEED_CATEGORIES,
  type FeedCategory,
  type FeedEvent,
} from "@/lib/live-feed.functions";

const CATEGORY_LABELS: Record<FeedCategory, string> = {
  geopolitics: "Geopolitics",
  "rare-earth": "Rare Earth",
  macro: "Macro",
  crypto: "Crypto",
};

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
  onPublish,
  publishingId,
}: {
  onPublish?: (e: FeedEvent) => void;
  publishingId?: string | null;
}) {
  const run = useServerFn(fetchLiveFeed);
  const [active, setActive] = useState<FeedCategory | "all">("all");
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [refreshingCat, setRefreshingCat] = useState<FeedCategory | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await run({ data: { categories: [...FEED_CATEGORIES], perCategory: 2 } });
      setEvents(res.events);
      setGeneratedAt(res.generatedAt);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Feed unavailable");
    } finally {
      setLoading(false);
    }
  }, [run]);

  const refreshCategory = useCallback(
    async (cat: FeedCategory) => {
      setRefreshingCat(cat);
      setErr(null);
      try {
        const res = await run({ data: { categories: [cat], perCategory: 2 } });
        setEvents((prev) => [
          ...prev.filter((e) => e.category !== cat),
          ...res.events,
        ]);
        setGeneratedAt(res.generatedAt);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Refresh failed");
      } finally {
        setRefreshingCat(null);
      }
    },
    [run],
  );

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 5 * 60_000); // 5 min auto-refresh
    return () => clearInterval(id);
  }, [load]);

  const filtered = useMemo(
    () => {
      if (active !== "all") return events.filter((e) => e.category === active);
      // "All" view: surface highest-impact stories first
      // (severity weighted by confidence, plus absolute risk delta).
      return [...events].sort((a, b) => {
        const score = (e: FeedEvent) =>
          (e.severity * e.confidence) / 100 + Math.abs(e.delta);
        return score(b) - score(a);
      });
    },
    [active, events],
  );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setActive("all")}
            className={`rounded-full border px-3 py-1.5 text-xs font-mono transition ${active === "all" ? "border-primary/60 bg-primary/10 text-primary" : "border-border/60 text-muted-foreground hover:text-foreground"}`}
          >
            All
          </button>
          {FEED_CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setActive(c)}
              className={`rounded-full border px-3 py-1.5 text-xs font-mono transition ${active === c ? "border-primary/60 bg-primary/10 text-primary" : "border-border/60 text-muted-foreground hover:text-foreground"}`}
            >
              {CATEGORY_LABELS[c]}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          {generatedAt && (
            <span className="font-mono text-[10px] text-muted-foreground">
              <Radio className="mr-1 inline h-3 w-3 text-primary" />
              live · {new Date(generatedAt).toUTCString().slice(17, 25)} UTC
            </span>
          )}
          <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading} className="gap-1.5">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
            Refresh
          </Button>
          {active !== "all" && (
            <Button
              size="sm"
              variant="default"
              onClick={() => void refreshCategory(active)}
              disabled={refreshingCat === active}
              className="gap-1.5"
            >
              {refreshingCat === active ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCcw className="h-3.5 w-3.5" />
              )}
              Refresh {CATEGORY_LABELS[active]}
            </Button>
          )}
        </div>
      </div>

      {err && (
        <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {err}
        </div>
      )}

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {loading && events.length === 0 ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-44 animate-pulse rounded-2xl border border-border/40 bg-card/30" />
          ))
        ) : (
          filtered.map((e, i) => (
            <motion.article
              key={`${e.category}:${e.sourceUrl}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: i * 0.04 }}
              className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card/40 p-6 backdrop-blur transition hover:border-primary/40"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
                    <Badge variant="outline" className="text-[10px]">{CATEGORY_LABELS[e.category]}</Badge>
                    <span className="text-muted-foreground/70">
                      {(() => {
                        const d = new Date(e.publishedAt);
                        return isNaN(d.getTime()) ? e.publishedAt : d.toUTCString().slice(5, 22) + " UTC";
                      })()}
                    </span>
                  </div>
                  <h3 className="mt-2 text-base font-medium leading-snug">{e.narrative}</h3>
                  {e.summary && (
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {e.summary}
                    </p>
                  )}
                </div>
                <StageBadge stage={e.stage} />
              </div>

              <div className="mt-5 grid grid-cols-3 gap-3">
                <Metric label="Severity" value={e.severity} />
                <Metric label="Confidence" value={e.confidence} />
                <div>
                  <div className="font-mono text-xs text-muted-foreground">Risk Δ</div>
                  <div className={`mt-1 font-mono text-2xl tabular-nums ${e.delta >= 0 ? "text-accent" : "text-primary"}`}>
                    {e.delta >= 0 ? "+" : ""}{e.delta}
                  </div>
                </div>
              </div>

              <div className="mt-5 flex items-center justify-between border-t border-border/60 pt-3">
                <a
                  href={e.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="line-clamp-1 max-w-[60%] font-mono text-[10px] text-muted-foreground hover:text-foreground"
                  title={e.sourceTitle}
                >
                  ↗ {e.sourceName ? `${e.sourceName} · ` : ""}{e.sourceTitle}
                </a>
                {/* "Publish to Arc" is an internal/admin action — hidden from public UI. */}
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

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-xs text-muted-foreground">{label}</span>
        <span className="font-mono text-xs tabular-nums">{value}</span>
      </div>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-gradient-to-r from-primary to-accent" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}