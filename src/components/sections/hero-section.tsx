import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Link2, Minus, Radio } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { preferredNetwork } from "@/lib/arc";
import { useWallet } from "@/hooks/wallet-provider";
import { supabaseFeed } from "@/lib/supabase-feed";

type Bucket = { t: number; avg: number; count: number };

type HeroStats = {
  count24h: number;
  countPrev24h: number;
  sources: number;
  risk: number;
  riskPrev: number;
  riskMin: number;
  riskMax: number;
  countWindowDays: number;
  buckets: Bucket[];
};

const EMPTY_STATS: HeroStats = {
  count24h: 0,
  countPrev24h: 0,
  sources: 0,
  risk: 0,
  riskPrev: 0,
  riskMin: 0,
  riskMax: 0,
  countWindowDays: 1,
  buckets: [],
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
    const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
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
          <path d="M60 0H0V30" fill="none" stroke="var(--border)" strokeOpacity="0.6" strokeWidth="0.5" />
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
      <path d={path} fill="none" stroke="url(#sparkStroke)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
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

function Delta({ value, unit = "", invert = false }: { value: number; unit?: string; invert?: boolean }) {
  const up = value > 0;
  const flat = value === 0;
  const bad = invert ? !up && !flat : up;
  const tone = flat
    ? "text-muted-foreground"
    : bad
      ? "text-rose-400"
      : "text-emerald-400";
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

export function HeroSection() {
  const { network } = useWallet();
  const activeNet = network ?? preferredNetwork();
  const [stats, setStats] = useState<HeroStats>(EMPTY_STATS);

  // Live hero stats from Supabase. Read-only public anon key — same source
  // the Live Feed hydrates from. Refreshes every 5 minutes.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const now = Date.now();
      const since24h = new Date(now - 24 * 60 * 60 * 1000).toISOString();
      const sincePrev24h = new Date(now - 48 * 60 * 60 * 1000).toISOString();
      const since7d = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

      // Pull a recent window once and derive all three stats client-side.
      const { data: recent } = await supabaseFeed
        .from("events")
        .select("severity, source_name, created_at")
        .gte("created_at", since7d)
        .order("created_at", { ascending: false })
        .limit(2000);

      // Distinct sources across ALL time (small table, cheap).
      const { data: allSources } = await supabaseFeed
        .from("events")
        .select("source_name")
        .limit(5000);

      if (cancelled) return;

      const rows = recent ?? [];
      const in24h = rows.filter((r) => r.created_at >= since24h);
      const inPrev24h = rows.filter(
        (r) => r.created_at >= sincePrev24h && r.created_at < since24h,
      );

      // Risk = avg severity over last 24h; fall back to last 7d if no
      // events in the 24h window so the index never flatlines at 0.
      const riskPool = in24h.length > 0 ? in24h : rows;
      const risk =
        riskPool.length > 0
          ? Math.round(
              riskPool.reduce((a, r) => a + (r.severity ?? 0), 0) /
                riskPool.length,
            )
          : 0;
      const riskPrev =
        inPrev24h.length > 0
          ? Math.round(
              inPrev24h.reduce((a, r) => a + (r.severity ?? 0), 0) /
                inPrev24h.length,
            )
          : risk;

      const sources = new Set(
        (allSources ?? [])
          .map((r) => r.source_name)
          .filter((s): s is string => typeof s === "string" && s.length > 0),
      ).size;

      // If the 24h window is empty, fall back to a wider 7d window so the
      // counter reflects the real event volume instead of a stale "0".
      const useFallback = in24h.length === 0 && rows.length > 0;

      // Build hourly buckets across the displayed window so the sparkline
      // shows whether risk is climbing or falling, not just a static number.
      const HOURS = 24;
      const windowMs = (useFallback ? 7 * 24 : HOURS) * 60 * 60 * 1000;
      const start = now - windowMs;
      const bucketCount = useFallback ? 28 : HOURS;
      const bucketMs = windowMs / bucketCount;
      const acc: Array<{ sum: number; count: number }> = Array.from(
        { length: bucketCount },
        () => ({ sum: 0, count: 0 }),
      );
      const pool = useFallback ? rows : in24h;
      for (const r of pool) {
        const t = new Date(r.created_at).getTime();
        const idx = Math.min(bucketCount - 1, Math.max(0, Math.floor((t - start) / bucketMs)));
        acc[idx].sum += r.severity ?? 0;
        acc[idx].count += 1;
      }
      // Forward-fill empty buckets so the line stays continuous instead of
      // dropping to zero on quiet hours.
      let carry = risk;
      const buckets: Bucket[] = acc.map((b, i) => {
        const avg = b.count > 0 ? b.sum / b.count : carry;
        if (b.count > 0) carry = avg;
        return { t: start + i * bucketMs, avg, count: b.count };
      });
      const severities = buckets.map((b) => b.avg);
      const riskMin = severities.length ? Math.round(Math.min(...severities)) : 0;
      const riskMax = severities.length ? Math.round(Math.max(...severities)) : 0;

      setStats({
        count24h: useFallback ? rows.length : in24h.length,
        countPrev24h: inPrev24h.length,
        sources,
        risk,
        riskPrev,
        riskMin,
        riskMax,
        countWindowDays: useFallback ? 7 : 1,
        buckets,
      });
    }
    void load();
    const id = setInterval(() => void load(), 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const riskDelta = stats.risk - stats.riskPrev;
  const countDelta = stats.count24h - stats.countPrev24h;
  const riskTrend = riskDelta > 0 ? "Escalating" : riskDelta < 0 ? "Cooling" : "Steady";
  const windowLabel = stats.countWindowDays === 7 ? "7D" : "24H";

  return (
    <section className="relative overflow-hidden">
      {/* Background is now provided globally by SiteShell (site-shell.tsx) so it's
          consistent across every page — no need for a page-local duplicate here. */}
      <div className="relative mx-auto max-w-7xl px-4 pb-20 pt-16 sm:px-6 sm:pt-24 md:pb-32">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="max-w-3xl"
        >
          <Badge
            variant="outline"
            className="mb-6 gap-2 border-primary/40 bg-primary/5 px-3 py-1 font-mono text-xs text-primary"
          >
            <Radio className="h-3 w-3" /> <span className="animate-blink-live">LIVE</span> · {activeNet.chainName} · Chain {activeNet.chainIdDec}
          </Badge>
          <h1 className="text-balance text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl md:text-7xl">
            Financializing{" "}
            <span className="bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
              Global Risk Narratives
            </span>
            .
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base">
            Geomacro is a real-time intelligence terminal and prediction
            market across the four pillars that move global risk.
            Geopolitics, rare earth supply, macroeconomics and crypto
            liquidity. Every breaking headline becomes a tradable
            48-hour contract on Arc.
          </p>
          <p className="mt-6 max-w-2xl text-base text-muted-foreground sm:text-lg">
            An LLM scores each event for severity. Two analyst agents,
            Hawk and Dove, publish opposing research notes. The USDC staked
            on each side becomes the live implied probability of escalation.
            Settle onchain in 48 hours. No custodian, no middleman, no noise.
          </p>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Button size="lg" asChild className="w-full gap-2 sm:w-auto">
              <Link to="/feed">
                Open Terminal <ArrowUpRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild className="w-full sm:w-auto">
              <a href={activeNet.explorer} target="_blank" rel="noreferrer" className="gap-2">
                <Link2 className="h-4 w-4" /> Open Arcscan
              </a>
            </Button>
          </div>

          <div className="mt-12 sm:mt-16 border-t border-border/60 pt-8">
            <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/60 backdrop-blur-sm">
              {/* Terminal header */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 bg-background/40 px-5 py-3 sm:px-6">
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-primary">
                    <span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]" />
                    GRI · LIVE
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    {windowLabel} · hourly avg severity
                  </span>
                </div>
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  Source: onchain events · refresh 5m
                </span>
              </div>

              {/* Main readout: value + delta + trend label */}
              <div className="grid grid-cols-1 gap-6 px-5 py-5 sm:grid-cols-[1.1fr_1fr] sm:px-6">
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
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                    <span>Trend: <span className={riskDelta > 0 ? "text-rose-400" : riskDelta < 0 ? "text-emerald-400" : "text-foreground"}>{riskTrend}</span></span>
                    <span>24h Low {stats.riskMin}</span>
                    <span>24h High {stats.riskMax}</span>
                    <span>Prev {stats.riskPrev}</span>
                  </div>
                  <p className="mt-3 max-w-md text-xs leading-relaxed text-muted-foreground">
                    A real-time, crowdsourced macro volatility index across
                    geopolitics, rare earth, macroeconomics and crypto.
                  </p>
                </div>

                {/* Sparkline panel */}
                <div className="relative rounded-lg border border-border/60 bg-background/40 p-3">
                  <div className="mb-1 flex items-center justify-center font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
                    <span>Severity · 0–100</span>
                  </div>
                  <Sparkline buckets={stats.buckets} risk={stats.risk} />
                  <div className="mt-1 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
                    <span>-{windowLabel}</span>
                    <span>now</span>
                  </div>
                </div>
              </div>

              {/* Secondary stat strip */}
              <div className="grid grid-cols-2 gap-px border-t border-border/60 bg-border/60 sm:grid-cols-4">
                <div className="flex flex-col gap-1 bg-card/60 px-5 py-4 sm:px-6">
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    Tracked Events / {windowLabel}
                  </span>
                  <span className="flex items-baseline gap-2 font-mono text-2xl tabular-nums text-foreground">
                    {stats.count24h.toLocaleString()}
                    {stats.countWindowDays === 1 && (
                      <Delta value={countDelta} />
                    )}
                  </span>
                </div>
                <div className="flex flex-col gap-1 bg-card/60 px-5 py-4 sm:px-6">
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    Data Sources
                  </span>
                  <span className="font-mono text-2xl tabular-nums text-foreground">
                    {stats.sources}
                  </span>
                </div>
                <div className="flex flex-col gap-1 bg-card/60 px-5 py-4 sm:px-6">
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    24h Range
                  </span>
                  <span className="font-mono text-2xl tabular-nums text-foreground">
                    {stats.riskMin}<span className="text-muted-foreground">–</span>{stats.riskMax}
                  </span>
                </div>
                <div className="flex flex-col gap-1 bg-card/60 px-5 py-4 sm:px-6">
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    Regime
                  </span>
                  <span className={`font-mono text-2xl ${stats.risk >= 70 ? "text-rose-400" : stats.risk >= 40 ? "text-amber-300" : "text-emerald-300"}`}>
                    {stats.risk >= 70 ? "Elevated" : stats.risk >= 40 ? "Watch" : "Calm"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
