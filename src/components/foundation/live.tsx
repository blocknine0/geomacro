/**
 * Live-data language. Human-readable first; technical source detail is secondary.
 */
import { Radio } from "lucide-react";
import { cn } from "@/lib/utils";

export function relativeTime(input: string | number | Date | null | undefined): string | null {
  if (input === null || input === undefined) return null;
  const t = typeof input === "number" ? input : new Date(input).getTime();
  if (!Number.isFinite(t)) return null;
  const diff = Date.now() - t;
  if (diff < 45_000) return "just now";
  const mins = Math.round(diff / 60_000);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function LiveIndicator({
  label = "Live",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 type-meta text-primary", className)}>
      <span className="size-1.5 rounded-full bg-positive animate-blink-live" aria-hidden />
      <Radio className="sr-only h-3 w-3" aria-hidden />
      {label}
    </span>
  );
}

export function LastUpdated({
  at,
  live = false,
  className,
}: {
  at: string | number | Date | null | undefined;
  live?: boolean;
  className?: string;
}) {
  const rel = relativeTime(at);
  return (
    <span className={cn("inline-flex items-center gap-2 text-xs text-muted-foreground", className)}>
      {live && <LiveIndicator />}
      <span>{rel ? `Updated ${rel}` : "Update time unavailable"}</span>
    </span>
  );
}

/** Technical provenance: kept, but visually secondary. */
export function SourceBadge({
  source,
  count,
  className,
}: {
  source?: string;
  count?: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[var(--radius-control)] border border-border/60 bg-card/50 px-1.5 py-0.5 type-meta text-muted-foreground",
        className,
      )}
    >
      {source ?? "Source"}
      {typeof count === "number" && <span className="type-metric text-[10px]">{count}</span>}
    </span>
  );
}
