import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Link2,
  Minus,
  Radio,
  Search,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyValue } from "@/components/foundation/data";
import { RiskBadge, riskLevel } from "@/components/foundation/risk";
import { LastUpdated } from "@/components/foundation/live";
import { InlineError, UpdatingIndicator } from "@/components/foundation/async-states";
import { useGlobalRisk } from "@/lib/use-global-risk";
import { GRI_METHOD_VERSION } from "@/lib/gri-current-contract";

type Bucket = { t: number; avg: number; count: number };

type HeroStats = {
  count24h: number;
  countPrev24h: number | null;
  independentStories: number;
  risk: number;
  riskPrev: number;
  riskMin: number;
  riskMax: number;
  buckets: Bucket[];
};

function Sparkline({ buckets, risk }: { buckets: Bucket[]; risk: number }) {
  const { path, area, points } = useMemo(() => {
    const W = 600;
    const H = 120;
    const PAD_X = 4;
    const PAD_Y = 8;
    const n = buckets.length;
    if (n < 2) {
      return { path: "", area: "", points: [] as Array<{ x: number; y: number }> };
    }
    const xs = buckets.map((_, i) => PAD_X + (i * (W - PAD_X * 2)) / (n - 1));
    // Fixed 0-100 domain so the line truly reads "is it climbing or falling".
    const ys = buckets.map(
      (b) => PAD_Y + (1 - Math.min(100, Math.max(0, b.avg)) / 100) * (H - PAD_Y * 2),
    );
    const pts = xs.map((x, i) => ({ x, y: ys[i] }));
    const d = pts
      .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(" ");
    const a = `${d} L${xs[n - 1].toFixed(1)} ${H - PAD_Y} L${xs[0].toFixed(1)} ${H - PAD_Y} Z`;
    return { path: d, area: a, points: pts };
  }, [buckets]);

  if (!path) {
    return (
      <div className="flex h-[120px] items-center justify-center font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        Awaiting signal
      </div>
    );
  }

  const last = points[points.length - 1];

  return (
    <svg viewBox="0 0 600 120" preserveAspectRatio="none" className="h-[120px] w-full" aria-hidden>
      <defs>
        <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.32" />
          <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="sparkStroke" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--primary)" />
          <stop offset="100%" stopColor="var(--accent)" />
        </linearGradient>
        <pattern id="sparkGrid" width="60" height="30" patternUnits="userSpaceOnUse">
          <path
            d="M60 0H0V30"
            fill="none"
            stroke="var(--border)"
            strokeOpacity="0.6"
            strokeWidth="0.5"
          />
        </pattern>
      </defs>
      <rect x="0" y="0" width="600" height="120" fill="url(#sparkGrid)" />
      {[25, 50, 75].map((v) => {
        const y = 8 + (1 - v / 100) * (120 - 16);
        return (
          <line
            key={v}
            x1="0"
            x2="600"
            y1={y}
            y2={y}
            stroke="var(--border)"
            strokeOpacity={v === 50 ? 0.9 : 0.5}
            strokeDasharray="2 4"
            strokeWidth="0.5"
          />
        );
      })}
      <path d={area} fill="url(#sparkFill)" />
      <path
        d={path}
        fill="none"
        stroke="url(#sparkStroke)"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={last.x} cy={last.y} r="6" fill="var(--primary)" fillOpacity="0.25" />
      <circle cx={last.x} cy={last.y} r="2.75" fill="var(--primary)" />
      <text
        x={last.x - 10}
        y={Math.max(18, last.y - 10)}
        textAnchor="end"
        className="fill-foreground"
        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        fontSize="15"
        fontWeight="600"
      >
        {risk}
      </text>
    </svg>
  );
}

function Delta({
  value,
  unit = "",
  invert = false,
}: {
  value: number;
  unit?: string;
  invert?: boolean;
}) {
  const up = value > 0;
  const flat = value === 0;
  const bad = invert ? !up && !flat : up;
  const tone = flat ? "text-muted-foreground" : bad ? "text-rose-400" : "text-emerald-400";
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  const sign = up ? "+" : "";
  return (
    <span className={`inline-flex items-center gap-1 font-mono text-[11px] tabular-nums ${tone}`}>
      <Icon className="h-3 w-3" />
      {sign}
      {value}
      {unit}
    </span>
  );
}

const STEPS = [
  {
    icon: Search,
    label: "Observe the event",
    description: "Capture a relevant geopolitical or macro development",
  },
  {
    icon: BookOpen,
    label: "Structure the evidence",
    description: "Normalize the event, sources, severity and confidence",
  },
  {
    icon: CheckCircle2,
    label: "Score and attribute",
    description: "Calculate risk and preserve the exact drivers of change",
  },
  {
    icon: Link2,
    label: "Verify the proof",
    description: "Trace methodology, provenance, timestamps and integrity",
  },
  {
    icon: Radio,
    label: "Deliver decision context",
    description: "Serve intelligence to professionals, APIs and Risk Gate",
  },
];

function StepGuide() {
  return (
    <div className="w-full max-w-sm rounded-2xl border border-border/70 bg-card/60 p-6 backdrop-blur-sm">
      <div className="mb-5 font-mono text-[10px] uppercase tracking-[0.18em] text-primary">
        How Geomacro works
      </div>
      <div className="flex flex-col">
        {STEPS.map((step, i) => {
          const Icon = step.icon;
          const isLast = i === STEPS.length - 1;
          return (
            <div key={step.label} className="flex">
              <div className="flex flex-col items-center">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-primary/40 bg-primary/10 text-primary shadow-[0_0_12px_rgba(59,130,246,0.12)]">
                  <Icon className="h-4 w-4" />
                </div>
                {!isLast && (
                  <div className="mt-2 h-7 w-px bg-gradient-to-b from-primary/40 to-primary/10" />
                )}
              </div>
              <div className="ml-4 pb-2 pt-1">
                <div className="text-sm font-semibold leading-tight text-foreground">
                  {i + 1}. {step.label}
                </div>
                <div className="mt-1 text-xs leading-snug text-muted-foreground">
                  {step.description}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function HeroSection() {
  const riskFeed = useGlobalRisk();
  const [whyOpen, setWhyOpen] = useState(false);
  // Use the already verified, 60-minute-delayed derived GRI projection
  // for WHY. Do not read frozen Supabase or expose raw publisher headlines.
  const contributors=(riskFeed.data?.drivers??[])
    .filter(d=>typeof d.score==="number" && Number.isFinite(d.score))
    .slice(0,3)
    .map(d=>({
      category:d.category,
      severity:d.score,
      deltaPoints:typeof d.change==="number" && Number.isFinite(d.change)?d.change:null,
    }));
  function toggleWhy(){setWhyOpen(open=>!open);}

  const stats = useMemo<HeroStats | null>(() => {
    const risk = riskFeed.data;
    if (!risk) return null;
    const s24 = risk.series["24H"];
    return {
      count24h: risk.eventCount,
      countPrev24h: risk.eventCountPrevious,
      independentStories: risk.independentStoryCount,
      risk: risk.score,
      riskPrev: risk.previous ?? risk.score,
      riskMin: s24.low ?? risk.score,
      riskMax: s24.high ?? risk.score,
      buckets: s24.buckets ?? [],
    };
  }, [riskFeed.data]);

  const state = riskFeed.status;
  const loadError = riskFeed.error;
  const updatedAt = riskFeed.updatedAt;

  const hasData = stats !== null;
  const riskDelta = stats ? stats.risk - stats.riskPrev : 0;
  const countDelta =
    stats && stats.countPrev24h !== null ? stats.count24h - stats.countPrev24h : null;
  const riskTrend = riskDelta > 0 ? "Escalating" : riskDelta < 0 ? "Cooling" : "Steady";
  const windowLabel = GRI_METHOD_VERSION;

  return (
    <section className="relative overflow-hidden">
      {/* Global background handled by SiteShell */}
      <div className="relative mx-auto max-w-7xl px-4 pb-6 pt-8 sm:px-6 sm:pt-10 md:pb-8 lg:pt-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
        >
          <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-[1fr_340px] lg:gap-14">
            <div className="max-w-2xl">
              <Badge
                variant="outline"
                className="mb-6 gap-2 border-primary/40 bg-primary/5 px-3 py-1 font-mono text-xs text-primary"
              >
                <Radio className="h-3 w-3" /> <span className="animate-blink-live">LIVE</span> ·{" "}
                GEOPOLITICAL + MACRO RISK INTELLIGENCE
              </Badge>
              <h1 className="text-[clamp(2rem,4.5vw,4.5rem)] font-semibold leading-[1.05] tracking-tight md:whitespace-nowrap">
                Know what changed.{" "}
                <span className="bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
                  Know why it matters
                </span>
                .
              </h1>
              <p className="mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base md:hidden">
                Geomacro turns global geopolitical and macro events into structured, explainable risk
                intelligence for professional and machine decision-making.
              </p>
              <div className="hidden md:block">
                <p className="mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base">
                  Geomacro converts global geopolitical, macroeconomic, critical-mineral and market
                  events into structured risk intelligence with severity, confidence, evidence,
                  historical context and deterministic Global Risk Index attribution.
                </p>
                <p className="mt-6 max-w-2xl text-base text-muted-foreground sm:text-lg">
                  The intelligence layer supports human research, institutional workflows and
                  machine-readable decision context through governed commercial interfaces.
                </p>
              </div>
              <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <Button size="lg" asChild className="w-full gap-2 sm:w-auto">
                  <Link to="/feed">
                    Open Intelligence <ArrowUpRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild className="w-full sm:w-auto">
                  <Link to="/data-api" className="gap-2">
                    <Link2 className="h-4 w-4" /> API & Agent Access
                  </Link>
                </Button>
              </div>
            </div>
            <div className="flex justify-center lg:justify-end lg:pt-28 xl:pt-32 2xl:pt-36">
              <StepGuide />
            </div>
          </div>

          <div className="mt-10 border-t border-border/60">
            <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/60 backdrop-blur-sm">
              <div className="lg:max-w-6xl lg:mx-auto">
                {/* Terminal header */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 bg-background/40 px-5 py-3 sm:px-6 lg:px-8">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-primary">
                      <span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]" />
                      GRI · LIVE
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                      {windowLabel} · canonical weighted score
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    {state === "updating" && <UpdatingIndicator />}
                    <LastUpdated at={updatedAt} />
                  </div>
                </div>

                {!hasData ? (
                  <div className="px-5 py-8 sm:px-6 lg:px-8">
                    {state === "error" ? (
                      <InlineError
                        error={loadError ?? "Live risk data is unavailable right now."}
                        onRetry={riskFeed.retry}
                      />
                    ) : (
                      <div className="space-y-4">
                        <div className="h-12 w-40 animate-pulse rounded bg-muted/60" />
                        <div className="h-24 w-full animate-pulse rounded bg-muted/40" />
                        <p className="type-meta text-muted-foreground">Loading live risk data…</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    {/* Main readout: value + delta + trend label */}
                    <div className="grid grid-cols-1 gap-6 px-5 py-5 sm:grid-cols-[1.1fr_1fr] sm:px-6 lg:px-8 lg:gap-8">
                      <div>
                        <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-primary">
                          <a
                            href="/global-risk"
                            className="underline-offset-4 transition hover:underline"
                          >
                            Global Risk Index
                          </a>
                        </div>
                        <div className="mt-2 flex items-baseline gap-3">
                          <div className="font-mono text-5xl tabular-nums text-foreground md:text-6xl">
                            {stats.risk}
                            <span className="ml-1 text-base text-muted-foreground">/100</span>
                          </div>
                          <Delta value={riskDelta} />
                          <RiskBadge score={stats.risk} />
                        </div>
                        <button
                          type="button"
                          onClick={() => void toggleWhy()}
                          aria-expanded={whyOpen}
                          className="mt-2 inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/5 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-primary transition-colors hover:bg-primary/10"
                        >
                          Why {stats.risk}?
                          <ChevronDown
                            className={`h-3 w-3 transition-transform ${whyOpen ? "rotate-180" : ""}`}
                          />
                        </button>
                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                          <span>
                            Trend:{" "}
                            <span
                              className={
                                riskDelta > 0
                                  ? "text-rose-400"
                                  : riskDelta < 0
                                    ? "text-emerald-400"
                                    : "text-foreground"
                              }
                            >
                              {riskTrend}
                            </span>
                          </span>
                          <span>24h Low {stats.riskMin}</span>
                          <span>24h High {stats.riskMax}</span>
                          <span>Prev {stats.riskPrev}</span>
                        </div>
                        <p className="mt-3 max-w-md text-xs leading-relaxed text-muted-foreground">
                          A deterministic global risk index built from versioned event severity,
                          confidence, recency decay and source- and story-capped evidence across three scoring domains.
                        </p>
                      </div>

                      {/* Sparkline panel */}
                      <div className="relative rounded-lg border border-border/60 bg-background/40 p-2 lg:p-1.5">
                        <div className="mb-1 flex items-center justify-center font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground lg:mb-0.5">
                          <span>GRI score · 0–100</span>
                        </div>
                        <Sparkline buckets={stats.buckets} risk={stats.risk} />
                        <div className="mt-1 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground lg:mt-0.5">
                          <span>-24H</span>
                          <span>now</span>
                        </div>
                      </div>
                    </div>

                    {/* Secondary stat strip */}
                    <div className="grid grid-cols-2 gap-px border-t border-border/60 bg-border/60 sm:grid-cols-4 lg:grid-cols-4 lg:gap-0 lg:bg-transparent">
                      <div className="flex flex-col gap-1 bg-card/60 px-5 py-4 sm:px-6 lg:px-4 lg:border-l lg:border-border/60 lg:first:border-l-0">
                        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                          Eligible Events / 72H
                        </span>
                        <span className="flex items-baseline gap-2 font-mono text-2xl tabular-nums text-foreground">
                          {stats.count24h.toLocaleString()}
                          {countDelta !== null && <Delta value={countDelta} />}
                        </span>
                      </div>
                      <div className="flex flex-col gap-1 bg-card/60 px-5 py-4 sm:px-6 lg:px-4 lg:border-l lg:border-border/60 lg:first:border-l-0">
                        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                          Independent stories
                        </span>
                        <span className="font-mono text-2xl tabular-nums text-foreground">
                          {stats.independentStories > 0 ? stats.independentStories : <EmptyValue />}
                        </span>
                      </div>
                      <div className="flex flex-col gap-1 bg-card/60 px-5 py-4 sm:px-6 lg:px-4 lg:border-l lg:border-border/60 lg:first:border-l-0">
                        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                          24h Range
                        </span>
                        <span className="font-mono text-2xl tabular-nums text-foreground">
                          {stats.riskMin}
                          <span className="text-muted-foreground">–</span>
                          {stats.riskMax}
                        </span>
                      </div>
                      <div className="flex flex-col gap-1 bg-card/60 px-5 py-4 sm:px-6 lg:px-4 lg:border-l lg:border-border/60 lg:first:border-l-0">
                        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                          Regime
                        </span>
                        <span className="font-mono text-2xl">
                          <RiskBadge score={stats.risk} />
                        </span>
                        <span className="sr-only">{riskLevel(stats.risk).label}</span>
                      </div>
                    </div>
                  </>
                )}

                {whyOpen && (
                  <div className="border-t border-border/60 bg-background/40 px-5 py-4 sm:px-6 lg:px-8">
                    <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                      Verified category-level GRI drivers · at least 1 hour delayed
                    </div>
                    {!contributors.length ? (
                      <div className="font-mono text-[11px] text-muted-foreground">
                        No verified category-level GRI attribution is available for this snapshot.
                      </div>
                    ) : (
                      <ul className="divide-y divide-border/50">
                        {contributors.map((d) => (
                          <li key={d.category} className="flex items-center gap-3 py-2">
                            <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                              {d.category === "geopolitics" ? "Geopolitics" :
                               d.category === "macro" ? "Macro / FX" :
                               d.category === "rare_earth" ? "Critical minerals" :
                               "Risk category"}
                            </span>
                            <span className="w-20 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
                              {d.severity.toFixed(1)} / 100
                            </span>
                            <span className="w-14 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
                              {d.deltaPoints === null ? "N/A" :
                               `${d.deltaPoints>0?"+":""}${d.deltaPoints.toFixed(2)}`}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="mt-3 text-[11px] text-muted-foreground">
                      Derived risk movements only. Source identities,
                      raw evidence and original articles remain private.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
