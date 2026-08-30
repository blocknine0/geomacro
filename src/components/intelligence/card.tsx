import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IntelligenceCard } from "@/components/foundation/cards";
import { FollowEventButton } from "@/components/foundation/follow-button";
import { prettyCategory, type IntelEvent } from "@/lib/use-intelligence";

/**
 * Compact intelligence card. Hierarchy: event → risk → why it matters →
 * freshness → action. Probability is never shown here because no observed
 * probability exists for a raw event row.
 */
export function EventIntelCard({
  event,
  compact = false,
  note,
}: {
  event: IntelEvent;
  compact?: boolean;
  note?: string;
}) {
  return (
    <IntelligenceCard
      category={event.category ? prettyCategory(event.category) : undefined}
      title={event.title}
      summary={compact ? undefined : (event.summary ?? undefined)}
      score={event.severity ?? undefined}
      trend={event.delta ?? undefined}
      timestamp={event.publishedAt ?? event.createdAt}
      className="h-full focus-within:border-primary/60 hover:border-primary/50"
      headingLevel="h3"
      cta={
        <span className="flex items-center gap-1">
          <FollowEventButton
            eventId={event.id}
            title={event.title}
            category={event.category}
            variant="icon"
          />
          <Button asChild variant="ghost" size="sm" className="gap-1">
            <Link to="/event/$eventId" params={{ eventId: event.id }}>
              View event <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              <span className="sr-only"> {event.title}</span>
            </Link>
          </Button>
        </span>
      }
    >
      {note && <p className="type-meta text-muted-foreground">{note}</p>}
    </IntelligenceCard>
  );
}

/** Dense list row used inside ranked panels and the sidebar. */
export function EventIntelRow({ event, rank, meta }: { event: IntelEvent; rank?: number; meta?: string }) {
  return (
    <Link
      to="/event/$eventId"
      params={{ eventId: event.id }}
      className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-[var(--radius-control)] border border-transparent px-3 py-2.5 transition-colors hover:border-border/70 hover:bg-card/60"
    >
      {rank !== undefined && <span className="type-meta w-4 text-muted-foreground">{rank}</span>}
      <span className="min-w-0">
        <span className="line-clamp-2 text-sm text-foreground">{event.title}</span>
        <span className="type-meta mt-0.5 block text-muted-foreground">
          {event.category ? prettyCategory(event.category) : "Uncategorised"}
          {meta ? ` · ${meta}` : ""}
        </span>
      </span>
      {event.severity !== null && (
        <span className="type-metric shrink-0 text-sm text-foreground">{Math.round(event.severity)}</span>
      )}
    </Link>
  );
}
