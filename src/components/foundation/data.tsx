type EmptyValueProps = {
  label?: string;
  className?: string;
};

export function EmptyValue({
  label = "Unavailable",
  className = "",
}: EmptyValueProps) {
  return (
    <span className={`text-muted-foreground ${className}`}>
      {label}
    </span>
  );
}

type StatusTone = "neutral" | "positive" | "warning" | "negative";

type StatusProps = {
  label: string;
  tone?: StatusTone;
  className?: string;
};

export function Status({
  label,
  tone = "neutral",
  className = "",
}: StatusProps) {
  const toneClass: Record<StatusTone, string> = {
    neutral: "border-border/60 bg-muted/30 text-muted-foreground",
    positive: "border-primary/40 bg-primary/10 text-primary",
    warning: "border-accent/50 bg-accent/10 text-accent",
    negative: "border-destructive/50 bg-destructive/10 text-destructive",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${toneClass[tone]} ${className}`}
    >
      {label}
    </span>
  );
}
