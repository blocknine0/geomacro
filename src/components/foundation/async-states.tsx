/**
 * Global async UI contract: loading / success / empty / error / updating.
 * Every major data surface should use these instead of one-off markup.
 */
import type { ReactNode } from "react";
import { useState } from "react";
import { AlertTriangle, Inbox, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { UserError } from "@/lib/user-errors";

export type AsyncStatus = "loading" | "success" | "empty" | "error" | "updating";

export function PageLoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex min-h-[50dvh] flex-col items-center justify-center gap-3 px-6">
      <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden />
      <p className="type-timestamp text-muted-foreground">{label}…</p>
    </div>
  );
}

export function SectionLoadingState({ label = "Loading", className }: { label?: string; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={cn("flex items-center gap-2 py-6 text-sm text-muted-foreground", className)}>
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      <span>{label}…</span>
    </div>
  );
}

export function CardSkeleton({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div aria-hidden className={cn("rounded-[var(--radius-card)] border border-border/60 bg-card/50 p-5", className)}>
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-3 h-5 w-3/4" />
      <div className="mt-4 space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} className="h-3 w-full" />
        ))}
      </div>
    </div>
  );
}

export function ChartSkeleton({ height = 120, className }: { height?: number; className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("rounded-[var(--radius-control)] border border-border/60 bg-background/40 p-3", className)}
    >
      <Skeleton className="w-full" style={{ height }} />
    </div>
  );
}

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div aria-hidden className="overflow-hidden rounded-[var(--radius-card)] border border-border/60">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="grid gap-3 border-b border-border/40 px-4 py-3 last:border-b-0" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className="h-3 w-full" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 rounded-[var(--radius-card)] border border-dashed border-border/70 bg-card/30 px-6 py-10 text-center", className)}>
      <span className="text-muted-foreground" aria-hidden>{icon ?? <Inbox className="h-5 w-5" />}</span>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && <p className="max-w-md text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function RetryButton({ onRetry, label = "Try again", size = "sm" }: { onRetry: () => void; label?: string; size?: "sm" | "default" }) {
  return (
    <Button variant="outline" size={size} onClick={onRetry} className="gap-2">
      <RefreshCw className="h-3.5 w-3.5" aria-hidden /> {label}
    </Button>
  );
}

/** Optional technical disclosure for advanced users. */
function Details({ detail }: { detail?: string }) {
  const [open, setOpen] = useState(false);
  if (!detail) return null;
  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="type-meta rounded-[var(--radius-control)] px-1.5 py-1 text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
      >
        {open ? "Hide details" : "Details"}
      </button>
      {open && <p className="type-technical mt-2 max-w-lg text-muted-foreground">{detail}</p>}
    </div>
  );
}

export function ErrorState({
  error,
  title = "This didn't load",
  onRetry,
  className,
}: {
  error?: UserError | string;
  title?: string;
  onRetry?: () => void;
  className?: string;
}) {
  const message = typeof error === "string" ? error : error?.message ?? "Something went wrong.";
  const detail = typeof error === "string" ? undefined : error?.detail;
  return (
    <div role="alert" className={cn("rounded-[var(--radius-card)] border border-border/70 bg-card/40 px-5 py-6", className)}>
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{message}</p>
          <Details detail={detail} />
          {onRetry && <div className="mt-3"><RetryButton onRetry={onRetry} /></div>}
        </div>
      </div>
    </div>
  );
}

export function InlineError({ error, onRetry, className }: { error?: UserError | string; onRetry?: () => void; className?: string }) {
  const message = typeof error === "string" ? error : error?.message;
  const detail = typeof error === "string" ? undefined : error?.detail;
  if (!message) return null;
  return (
    <div role="alert" className={cn("mt-2 text-sm text-destructive", className)}>
      <span className="inline-flex items-start gap-1.5">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="min-w-0">{message}</span>
      </span>
      <Details detail={detail} />
      {onRetry && <div className="mt-2"><RetryButton onRetry={onRetry} /></div>}
    </div>
  );
}

/** Non-blocking "data is refreshing" affordance. */
export function UpdatingIndicator({ label = "Updating", className }: { label?: string; className?: string }) {
  return (
    <span role="status" aria-live="polite" className={cn("inline-flex items-center gap-1.5 type-meta text-muted-foreground", className)}>
      <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> {label}
    </span>
  );
}
