import type { ReactNode } from "react";
import { EmptyState } from "@/components/foundation/async-states";
import { EventIntelCard, EventIntelRow } from "@/components/intelligence/card";
import type { IntelEvent } from "@/lib/use-intelligence";
import { cn } from "@/lib/utils";

export function IntelSection({
  id,
  title,
  subtitle,
  aside,
  children,
  className,
}: {
  id: string;
  title: string;
  subtitle?: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className={cn("min-w-0", className)}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id={`${id}-heading`} className="type-section-heading text-foreground">
            {title}
          </h2>
          {subtitle && <p className="type-body mt-1 text-muted-foreground">{subtitle}</p>}
        </div>
        {aside}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function EventGrid({ events }: { events: IntelEvent[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {events.map((e) => (
        <EventIntelCard key={e.id} event={e} />
      ))}
    </div>
  );
}

export function RankedPanel({
  events,
  metaFor,
}: {
  events: IntelEvent[];
  metaFor?: (e: IntelEvent) => string | undefined;
}) {
  return (
    <div className="rounded-[var(--radius-card)] border border-border/70 bg-card/40 p-2">
      {events.map((e, i) => (
        <EventIntelRow key={e.id} event={e} rank={i + 1} meta={metaFor?.(e)} />
      ))}
    </div>
  );
}

/** Shown when a surface genuinely cannot be computed from stored data. */
export function UnavailableSurface({ title, description }: { title: string; description: string }) {
  return <EmptyState title={title} description={description} />;
}
