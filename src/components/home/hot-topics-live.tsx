import { Link } from "@tanstack/react-router";
import { ArrowRight, Radio, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RiskBadge, RiskTrend } from "@/components/foundation/risk";
import { prettyCategory, useIntelligence } from "@/lib/use-intelligence";

function observedLabel(value: string | null | undefined) {
  if (!value) return "Observed time unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Observed time unavailable";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function HotTopicsLive() {
  const intelligence = useIntelligence();
  const rows = intelligence.data?.topRisks.slice(0, 6) ?? [];

  return (
    <div className="mt-10 border-t border-border/60 pt-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-3xl">
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-primary">
            <Radio className="h-3.5 w-3.5" /> Current risk topics
          </div>
          <h3 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
            Live developments stay separate from the structural country baseline.
          </h3>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Geomacro keeps current events time-stamped and evidence-linked so a temporary escalation, sanction, policy shock or disruption is not silently turned into a permanent country fact. Structural context and live-event context are evaluated as separate layers.
          </p>
        </div>
        <Button asChild variant="outline" className="gap-2">
          <Link to="/intelligence">
            Open live intelligence <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>

      {rows.length ? (
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((event) => (
            <article key={event.id} className="rounded-2xl border border-border/70 bg-background/45 p-5">
              <div className="flex flex-wrap items-center gap-2">
                {event.severity !== null ? <RiskBadge score={event.severity} showScore /> : null}
                {event.delta !== null && event.delta !== 0 ? <RiskTrend delta={Math.round(event.delta)} /> : null}
                {event.category ? (
                  <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    {prettyCategory(event.category)}
                  </span>
                ) : null}
              </div>
              <h4 className="mt-4 line-clamp-3 text-base font-semibold leading-snug">
                <Link to="/event/$eventId" params={{ eventId: event.id }} className="hover:text-primary">
                  {event.title}
                </Link>
              </h4>
              <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                {observedLabel(event.publishedAt ?? event.createdAt)}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-dashed border-border/70 bg-background/30 p-5 text-sm text-muted-foreground">
          <RefreshCw className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Current scored events are temporarily unavailable. Geomacro does not fill the gap with synthetic headlines or a fallback risk claim.
          </p>
        </div>
      )}

      <div className="mt-5 grid gap-3 text-xs leading-relaxed text-muted-foreground md:grid-cols-3">
        <p><span className="font-medium text-foreground">Event lifecycle:</span> current claims carry observed/retrieved timing and age out instead of becoming permanent truth.</p>
        <p><span className="font-medium text-foreground">Attribution:</span> event-driven movement is kept distinguishable from the slower structural country layer.</p>
        <p><span className="font-medium text-foreground">Paid delivery:</span> hot-topic intelligence is chargeable only when the requested current evidence passes freshness and commercial-eligibility checks.</p>
      </div>
    </div>
  );
}
