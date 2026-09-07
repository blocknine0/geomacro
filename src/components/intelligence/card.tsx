import { prettyCategory, type IntelEvent } from "@/lib/use-intelligence";

export function EventIntelCard({
  event,
  compact = false,
  note,
}: {
  event: IntelEvent;
  compact?: boolean;
  note?: string;
}) {
  const timestamp = event.publishedAt ?? event.createdAt;

  return (
    <article className="h-full rounded-[var(--radius-card)] border border-border/70 bg-card/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="type-meta text-muted-foreground">
            {event.category
              ? prettyCategory(event.category)
              : "Uncategorised"}
          </p>

          <h3 className="mt-1 text-sm font-medium text-foreground">
            {event.title}
          </h3>
        </div>

        {event.severity !== null ? (
          <span className="type-metric shrink-0 text-foreground">
            {Math.round(event.severity)}
          </span>
        ) : null}
      </div>

      {!compact && event.summary ? (
        <p className="mt-2 type-body text-muted-foreground">
          {event.summary}
        </p>
      ) : null}

      {note ? (
        <p className="mt-2 type-meta text-muted-foreground">
          {note}
        </p>
      ) : null}

      <p className="mt-3 type-timestamp text-muted-foreground">
        {timestamp}
      </p>
    </article>
  );
}

export function EventIntelRow({
  event,
  rank,
  meta,
}: {
  event: IntelEvent;
  rank?: number;
  meta?: string;
}) {
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-[var(--radius-control)] border border-transparent px-3 py-2.5">
      {rank !== undefined ? (
        <span className="type-meta w-4 text-muted-foreground">
          {rank}
        </span>
      ) : null}

      <span className="min-w-0">
        <span className="line-clamp-2 text-sm text-foreground">
          {event.title}
        </span>

        <span className="type-meta mt-0.5 block text-muted-foreground">
          {event.category
            ? prettyCategory(event.category)
            : "Uncategorised"}
          {meta ? ` · ${meta}` : ""}
        </span>
      </span>

      {event.severity !== null ? (
        <span className="type-metric shrink-0 text-sm text-foreground">
          {Math.round(event.severity)}
        </span>
      ) : null}
    </div>
  );
}
