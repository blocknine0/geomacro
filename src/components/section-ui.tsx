import { AGENTS, type AgentSide } from "@/lib/agents";

export function shortAddr(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function formatCountdown(ms: number) {
  if (ms <= 0) return "0s";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

export function Stat({
  label,
  value,
  suffix,
  accent,
}: {
  label: string;
  value: number;
  suffix?: string;
  accent?: boolean;
}) {
  return (
    <div>
      <dt className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{label}</dt>
      <dd className={`mt-2 font-mono text-3xl tabular-nums ${accent ? "text-primary" : ""}`}>
        {value}
        {suffix && <span className="text-base text-muted-foreground">{suffix}</span>}
      </dd>
    </div>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  desc,
}: {
  eyebrow: string;
  title: string;
  desc?: string;
}) {
  return (
    <div className="max-w-2xl">
      <div className="font-mono text-xs uppercase tracking-widest text-primary">{eyebrow}</div>
      <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">{title}</h2>
      {desc && <p className="mt-3 text-muted-foreground">{desc}</p>}
    </div>
  );
}

export function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/40 pb-2 last:border-0">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className={mono ? "font-mono text-xs break-all text-right" : "text-right"}>{v}</dd>
    </div>
  );
}

export function AgentPosition({
  side,
  position,
  realStakeUsdc,
  realConfidence,
  trackRecord,
}: {
  side: AgentSide;
  position: { side: "YES" | "NO"; confidence: number; stakeUsdc: number; rationale: string };
  realStakeUsdc?: number;
  realConfidence?: number;
  trackRecord?: number | null;
}) {
  const isHawk = side === "HAWK";
  const accent = isHawk ? "text-destructive" : "text-primary";
  const dot = isHawk ? "bg-destructive" : "bg-primary";
  const borderAccent = isHawk ? "border-destructive/40" : "border-primary/40";
  const stakeUsdc = realStakeUsdc ?? position.stakeUsdc;
  const confidence = realConfidence ?? position.confidence;
  const noteLabel = isHawk ? "Geopolitical Risk Briefing" : "De-escalation Research Note";
  return (
    <div className={`relative bg-background p-5 border-l-2 ${borderAccent}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
            <span className={`font-mono text-[10px] uppercase tracking-widest ${accent}`}>
              {AGENTS[side].name}
            </span>
          </div>
          <div className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
            {noteLabel}
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
            Track Record
          </div>
          <div className={`font-mono text-sm tabular-nums ${accent}`}>
            {trackRecord == null ? "—" : `${trackRecord}%`}
          </div>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 border-y border-border/40 py-3">
        <div>
          <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
            Conviction
          </div>
          <div className={`font-mono text-base tabular-nums ${accent}`}>
            {confidence}%
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
            Capital On Side
          </div>
          <div className={`font-mono text-base tabular-nums ${accent}`}>
            {stakeUsdc.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            <span className="ml-1 text-[10px] text-muted-foreground">USDC</span>
          </div>
        </div>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{position.rationale}</p>
    </div>
  );
}