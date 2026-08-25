import { Badge } from "@/components/ui/badge";

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function riskLabel(score: number): string {
  const value = clampPercent(score);

  if (value >= 75) return "High risk";
  if (value >= 50) return "Elevated risk";
  if (value >= 25) return "Moderate risk";
  return "Low risk";
}

export function RiskBadge({
  score,
  showScore = false,
  className = "",
}: {
  score: number;
  showScore?: boolean;
  className?: string;
}) {
  const value = clampPercent(score);

  const tone =
    value >= 75
      ? "border-destructive/50 bg-destructive/10 text-destructive"
      : value >= 50
        ? "border-accent/50 bg-accent/10 text-accent"
        : value >= 25
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-border/60 bg-muted/30 text-muted-foreground";

  return (
    <Badge
      variant="outline"
      className={`${tone} font-mono text-[10px] uppercase tracking-wider ${className}`}
    >
      {riskLabel(value)}
      {showScore ? ` · ${Math.round(value)}` : ""}
    </Badge>
  );
}

export function ProbabilityBadge({
  value,
  label,
  className = "",
}: {
  value: number;
  label?: string;
  className?: string;
}) {
  const probability = clampPercent(value);

  return (
    <Badge
      variant="outline"
      className={`border-primary/40 bg-primary/10 font-mono text-[10px] uppercase tracking-wider text-primary ${className}`}
    >
      {label ? `${label} · ` : ""}
      {probability.toFixed(1)}%
    </Badge>
  );
}
