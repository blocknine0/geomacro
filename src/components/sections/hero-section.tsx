import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Clock,
  Link2,
  Loader2,
  Minus,
  Radio,
  Search,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { preferredNetwork } from "@/lib/arc";
import { useWallet } from "@/hooks/WalletProvider";
import { supabaseFeed } from "@/lib/supabase-feed";
import { EmptyValue } from "@/components/foundation/data";
import { RiskBadge, riskLevel } from "@/components/foundation/risk";
import { LastUpdated } from "@/components/foundation/live";
import { InlineError, UpdatingIndicator } from "@/components/foundation/async-states";
import { reportError } from "@/lib/user-errors";
import { useGlobalRisk } from "@/lib/use-global-risk";

type Bucket = { t: number; avg: number; count: number };

type Contributor = {
  source_title: string | null;
  category: string | null;
  severity: number | null;
  deltaPoints: number;
  kind: string;
};

type HeroStats = {
  count24h: number;
  countPrev24h: number | null;
  sources: number;
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
    label: "Choose an event",
    description: "Pick a live geopolitical or macro event",
  },
  {
    icon: BookOpen,
    label: "Read the research",
    description: "Review Hawk vs Dove briefings",
  },
  {
    icon: Wallet,
    label: "Stake USDC",
    description: "Lock USDC on your conviction",
  },
  {
    icon: Clock,
    label: "Wait for result",
    description: "46-hour staking window runs",
  },
  {
    icon: CheckCircle2,
    label: "Get settlement",
    description: "Claim your payout onchain",
  },
];

function StepGuide() {
  return (
    <div className="w-full max-w-sm rounded-2xl border border-border/70 bg-card/60 p-6 backdrop-blur-sm">
      <div className="mb-5 font-mono text-[10px] uppercase tracking-[0.18em] text-primary">
        How it works
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
  const { network } = useWallet();
  const activeNet = network ?? preferredNetwork();
  const riskFeed = useGlobalRisk();
  const [whyOpen, setWhyOpen] = useState(false);
  const [whyLoading, setWhyLoading] = useState(false);
  const [contributors, setContributors] = useState<Contributor[] | null>(null);

  async function toggleWhy() {
    const next = !whyOpen;
    setWhyOpen(next);
    if (!next || contributors !== null || whyLoading) return;
    setWhyLoading(true);
    // Prefer the stored attribution for the exact snapshot currently displayed.
    // This makes "Why N?" reconcile to the published score/hash rather than a
    // fresh client-side re-evaluation a few seconds later.
    if (riskFeed.data?.auditPersisted && riskFeed.data.snapshotAsOf) {
      try {
        const { data: snapshot, error: snapshotError } = await supabaseFeed
          .from("gri_snapshots")
          .select("change_attribution")
          .eq("id", riskFeed.data.snapshotId)
          .maybeSingle();
        if (
          !snapshotError &&
          snapshot?.change_attribution &&
          typeof snapshot.change_attribution === "object"
        ) {
          const attr = snapshot.change_attribution as {
            eventChanges?: Array<Record<string, unknown>>;
          };
          const top = (attr.eventChanges ?? [])
            .filter((e) => Math.abs(Number(e.deltaPoints ?? 0)) > 0.000001)
            .slice(0, 10)
            .map((e) => ({
              source_title: (e.sourceTitle as string | null) ?? null,
              category: (e.category as string | null) ?? null,
              severity:
                typeof e.currentSeverity === "number"
                  ? e.currentSeverity
                  : typeof e.previousSeverity === "number"
                    ? e.previousSeverity
                    : null,
              deltaPoints: Number(e.deltaPoints ?? 0),
              kind: String(e.kind ?? "reweighted"),
            }));
          setContributors(top);
          setWhyLoading(false);
          return;
        }
      } catch (e) {
        reportError("HeroSection.snapshotAttribution", e, "loading persisted GRI attribution");
      }
    }

    // Current public GRI surfaces never run a historical client-side
    // calculator. If persisted attribution is unavailable, for example on
    // the first snapshot of a methodology series, expose that honestly.
    setContributors([]);
    setWhyLoading(false);
  }

  const stats = useMemo<HeroStats | null>(() => {
    const risk = riskFeed.data;
    if (!risk) return null;
    const s24 = risk.series["24H"];
    return {
      count24h: risk.eventCount,
      countPrev24h: risk.eventCountPrevious,
      sources: risk.sourceCount ?? 0,
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
  const windowLabel = "GRI v1";

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
                {activeNet.chainName} · Chain {activeNet.chainIdDec}
              </Badge>
              <h1 className="text-[clamp(2rem,4.5vw,4.5rem)] font-semibold leading-[1.05] tracking-tight md:whitespace-nowrap">
                Financializing{" "}
                <span className="bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
                  Global Risk Narratives
                </span>
                .
              </h1>
              <p className="mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base md:hidden">
                Geomacro turns breaking news into onchain prediction markets. AI agents Hawk and
                Dove argue opposite sides, you stake USDC on the one that ages better, and the
                result settles onchain automatically.
              </p>
              <div className="hidden md:block">
                <p className="mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base">
                  Geomacro turns global risk into a tradable signal. An autonomous pipeline reads
                  breaking headlines the moment they hit, across four pillars: geopolitics, rare
                  earth supply, macroeconomics, and crypto liquidity. When something significant
                  happens, a market opens itself automatically. No editor, no curator, no manual
                  listing. Each market stays open for staking for 46 hours, and two hours after
                  staking closes, the result settles onchain.
                </p>
                <p className="mt-6 max-w-2xl text-base text-muted-foreground sm:text-lg">
                  An LLM scores every event for severity in real time, and two AI agents take
                  opposing sides. Agent Hawk argues the case for escalation, Agent Dove argues for
                  calm. You stake USDC on whichever side you think ages better, and the same LLM
                  later re-reads the story to judge the outcome. No custodian holds your funds, no
                  middleman decides the result, and no human ever has to click a button to make any
                  of it run.
                </p>
              </div>
              <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <Button size="lg" asChild className="w-full gap-2 sm:w-auto">
                  <Link to="/feed">
                    Open Terminal <ArrowUpRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild className="w-full sm:w-auto">
                  <a
                    href="https://testnet.arcscan.app/address/0xC026fDFC40Dcd8F07b6ecFA21b2BF8400Db0FADe"
                    target="_blank"
                    rel="noreferrer"
                    className="gap-2"
                  >
                    <Link2 className="h-4 w-4" /> Open Arcscan
                  </a>
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
                          Global Risk Index
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
                          confidence, recency decay and source-capped evidence across four domains.
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
                          Data Sources
                        </span>
                        <span className="font-mono text-2xl tabular-nums text-foreground">
                          {stats.sources > 0 ? stats.sources : <EmptyValue />}
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
                      24h GRI change attribution · top 10 exact event effects
                    </div>
                    {whyLoading ? (
                      <div className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" /> Loading contributors…
                      </div>
                    ) : !contributors || contributors.length === 0 ? (
                      <div className="font-mono text-[11px] text-muted-foreground">
                        No event-level GRI change is available for this comparison
                      </div>
                    ) : (
                      <ul className="divide-y divide-border/50">
                        {contributors.map((c, i) => {
                          const d = c.deltaPoints;
                          return (
                            <li key={i} className="flex items-center gap-3 py-2">
                              <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                                {c.source_title ?? "Untitled event"}
                              </span>
                              {c.category && (
                                <span className="shrink-0 rounded border border-border/70 bg-card/60 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                                  {c.category}
                                </span>
                              )}
                              <span className="w-10 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
                                {c.severity ?? "N/A"}
                                <span className="sr-only">
                                  {c.severity === null || c.severity === undefined
                                    ? " severity unavailable"
                                    : " severity"}
                                </span>
                              </span>
                              <span
                                className={`w-10 shrink-0 text-right font-mono text-[11px] tabular-nums ${
                                  d !== null && d > 0
                                    ? "text-rose-400"
                                    : d !== null && d < 0
                                      ? "text-emerald-400"
                                      : "text-muted-foreground"
                                }`}
                              >
                                {`${d > 0 ? "+" : ""}${d.toFixed(2)}`}
                                <span className="sr-only"> GRI points, {c.kind}</span>
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
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
