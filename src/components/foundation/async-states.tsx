import type { ReactNode } from "react";

type EmptyStateProps = {
  title?: string;
  description?: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({
  title = "Nothing to show",
  description,
  children,
  action,
  className = "",
}: EmptyStateProps) {
  return (
    <div
      className={`rounded-xl border border-border/60 bg-muted/20 px-5 py-8 text-center ${className}`}
      role="status"
    >
      <div className="mx-auto max-w-md space-y-2">
        <p className="text-sm font-medium text-foreground">{title}</p>

        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}

        {children ? (
          <div className="text-sm text-muted-foreground">{children}</div>
        ) : null}

        {action ? <div className="pt-3">{action}</div> : null}
      </div>
    </div>
  );
}

type InlineErrorProps = {
  error?: string | Error | null;
  message?: string;
  children?: ReactNode;
  retry?: () => void;
  retryLabel?: string;
  className?: string;
};

export function InlineError({
  error,
  message,
  children,
  retry,
  retryLabel = "Try again",
  className = "",
}: InlineErrorProps) {
  const resolved =
    message ??
    (typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : null) ??
    children ??
    "Something went wrong.";

  return (
    <div
      className={`rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm ${className}`}
      role="alert"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-destructive">{resolved}</div>

        {retry ? (
          <button
            type="button"
            onClick={retry}
            className="rounded-md border border-destructive/30 px-3 py-1.5 text-xs font-medium text-destructive transition hover:bg-destructive/10"
          >
            {retryLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}
