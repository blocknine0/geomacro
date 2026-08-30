/**
 * Risk semantics. Never color-only: every risk surface also renders its label.
 */
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

export type RiskLevel = "calm" | "stable" | "watch" | "elevated" | "critical";

const LEVELS: Array<{ level: RiskLevel; label: string; max: number; className: string; description: string }> = [
  { level: "calm", label: "Calm", max: 20, className: "text-risk-calm border-risk-calm/40 bg-risk-calm/10", description: "Global risk is subdued." },
  { level: "stable", label: "Stable", max: 40, className: "text-risk-stable border-risk-stable/40 bg-risk-stable/10", description: "Global risk is stable." },
  { level: "watch", label: "Watch", max: 60, className: "text-risk-watch border-risk-watch/40 bg-risk-watch/10", description: "Global risk is moderately elevated." },
  { level: "elevated", label: "Elevated", max: 80, className: "text-risk-elevated border-risk-elevated/40 bg-risk-elevated/10", description: "Global risk is elevated." },
  { level: "critical", label: "Critical", max: 101, className: "text-risk-critical border-risk-critical/40 bg-risk-critical/10", description: "Global risk is severe." },
];

export function riskLevel(score: number) {
  const clamped = Math.min(100, Math.max(0, score));
  return LEVELS.find((l) => clamped < l.max) ?? LEVELS[LEVELS.length - 1];
}

/** Compact "WATCH" pill. Pass `score` to render "41 / 100 · WATCH". */
export function RiskBadge({ score, showScore = false, className }: { score: number; showScore?: boolean; className?: string }) {
  const l = riskLevel(score);
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-[var(--radius-control)] border px-2 py-0.5 type-meta", l.className, className)}>
      {showScore && <span className="type-metric text-[11px] tracking-normal">{Math.round(score)} / 100 ·</span>}
      {l.label}
    </span>
  );
}

/** Large numeric readout with mandatory semantic label. */
export function RiskScore({
  score,
  size = "lg",
  suffix = "/100",
  className,
}: {
  score: number;
  size?: "sm" | "md" | "lg";
  suffix?: string;
  className?: string;
}) {
  const l = riskLevel(score);
  const sizeClass = size === "lg" ? "text-5xl md:text-6xl" : size === "md" ? "text-3xl" : "text-xl";
  return (
    <span className={cn("inline-flex items-baseline gap-3", className)}>
      <span className={cn("type-metric text-foreground", sizeClass)}>
        {Math.round(score)}
        <span className="ml-1 text-base text-muted-foreground">{suffix}</span>
      </span>
      <RiskBadge score={score} />
    </span>
  );
}

export function RiskTrend({ delta, unit = "", className }: { delta: number; unit?: string; className?: string }) {
  const flat = delta === 0;
  const up = delta > 0;
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  const tone = flat ? "text-muted-foreground" : up ? "text-negative" : "text-positive";
  const word = flat ? "Steady" : up ? "Escalating" : "Cooling";
  return (
    <span className={cn("inline-flex items-center gap-1 type-metric text-[11px]", tone, className)}>
      <Icon className="h-3 w-3" aria-hidden />
      {up ? "+" : ""}
      {delta}
      {unit}
      <span className="type-meta ml-1">{word}</span>
    </span>
  );
}

export function ProbabilityBadge({ value, label, className }: { value: number; label?: string; className?: string }) {
  const pct = Math.round(Math.min(100, Math.max(0, value)));
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-[var(--radius-control)] border border-border/70 bg-card/60 px-2 py-0.5", className)}>
      <span className="type-metric text-xs text-foreground">{pct}%</span>
      {label && <span className="type-meta text-muted-foreground">{label}</span>}
    </span>
  );
}
