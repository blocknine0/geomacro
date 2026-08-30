import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Shared homepage section frame: consistent rhythm, one h2 per section. */
export function HomeSection({
  id,
  eyebrow,
  title,
  subtitle,
  aside,
  children,
  className,
  contentClassName,
}: {
  id?: string;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  aside?: ReactNode;
  children?: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  const headingId = id ? `${id}-heading` : undefined;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cn("mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 md:py-20", className)}
    >
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <div className="min-w-0">
          {eyebrow && <p className="type-meta text-primary">{eyebrow}</p>}
          <h2 id={headingId} className="type-page-heading mt-2 text-balance text-foreground">
            {title}
          </h2>
          {subtitle && (
            <p className="mt-3 max-w-2xl text-pretty type-body text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {aside && <div className="shrink-0">{aside}</div>}
      </div>
      {children && <div className={cn("mt-8", contentClassName)}>{children}</div>}
    </section>
  );
}
