import { useId, useMemo, useState } from "react";
import type { Bucket } from "@/lib/use-global-risk";
import { cn } from "@/lib/utils";

/**
 * Dependency-free risk line. Fixed 0–100 domain so the shape always reads
 * as "risk climbing / cooling" rather than an auto-scaled squiggle.
 */
export function RiskChart({
  buckets,
  label,
  className,
  height = 200,
}: {
  buckets: Bucket[];
  label: string;
  className?: string;
  height?: number;
}) {
  const gradientId = useId();
  const [hover, setHover] = useState<number | null>(null);
  const W = 800;
  const H = 240;
  const PAD_X = 6;
  const PAD_Y = 14;

  const { pts, path, area } = useMemo(() => {
    const n = buckets.length;
    if (n < 2) return { pts: [] as Array<{ x: number; y: number }>, path: "", area: "" };
    const points = buckets.map((b, i) => ({
      x: PAD_X + (i * (W - PAD_X * 2)) / (n - 1),
      y: PAD_Y + (1 - Math.min(100, Math.max(0, b.avg)) / 100) * (H - PAD_Y * 2),
    }));
    const d = points
      .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
      .join(" ");
    return {
      pts: points,
      path: d,
      area: `${d} L${points[points.length - 1].x.toFixed(1)},${H - PAD_Y} L${points[0].x.toFixed(1)},${H - PAD_Y} Z`,
    };
  }, [buckets]);

  if (pts.length === 0) return null;

  const last = pts[pts.length - 1];
  const activeIndex = hover ?? buckets.length - 1;
  const active = buckets[activeIndex];
  const activePt = pts[activeIndex];
  const summary = `${label}: current ${Math.round(buckets[buckets.length - 1].avg)} of 100`;

  return (
    <figure className={cn("relative", className)}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={summary}
        style={{ height }}
        className="w-full touch-pan-y"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const ratio = (e.clientX - rect.left) / rect.width;
          setHover(
            Math.min(buckets.length - 1, Math.max(0, Math.round(ratio * (buckets.length - 1)))),
          );
        }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[25, 50, 75].map((g) => {
          const y = PAD_Y + (1 - g / 100) * (H - PAD_Y * 2);
          return (
            <line
              key={g}
              x1={PAD_X}
              x2={W - PAD_X}
              y1={y}
              y2={y}
              stroke="currentColor"
              strokeWidth="1"
              className="text-border/50"
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
        <path d={area} fill={`url(#${gradientId})`} />
        <path
          d={path}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        <line
          x1={activePt.x}
          x2={activePt.x}
          y1={PAD_Y}
          y2={H - PAD_Y}
          stroke="currentColor"
          strokeWidth="1"
          className="text-border"
          vectorEffect="non-scaling-stroke"
        />
        <circle
          cx={activePt.x}
          cy={activePt.y}
          r="4"
          fill="var(--primary)"
          vectorEffect="non-scaling-stroke"
        />
        <circle
          cx={last.x}
          cy={last.y}
          r="3"
          fill="var(--primary)"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <figcaption className="mt-2 flex items-center justify-between type-meta text-muted-foreground">
        <span>
          {new Date(active.t).toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            hour: "numeric",
            hour12: true,
          })}
        </span>
        <span className="text-foreground">
          {Math.round(active.avg)} / 100
          {active.count > 0 && (
            <span className="ml-2 text-muted-foreground">
              {active.count} event{active.count === 1 ? "" : "s"}
            </span>
          )}
        </span>
      </figcaption>
      <p className="sr-only">{summary}</p>
    </figure>
  );
}
