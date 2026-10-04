import { useState } from "react";
import { RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RiskBadge, RiskTrend } from "@/components/foundation/risk";
import { RiskChart } from "@/components/home/risk-chart";
import { useGlobalRisk, type Timeframe } from "@/lib/use-global-risk";

const TIMEFRAMES: Timeframe[] = ["24H", "7D", "30D"];

export const DOMAIN_INDEX_SPECS = [
  { key: "geopolitics", name: "Geopolitical Risk Index" },
  { key: "macro", name: "Macroeconomic Risk Index" },
  { key: "rare_earth", name: "Critical Minerals Risk Index" },
] as const;

export function GlobalRiskDomainIndices() {
  const risk = useGlobalRisk();
  const [timeframe, setTimeframe] = useState<Timeframe>("7D");

  if (!risk.data) {
    const unavailable = risk.status === "error";
    return (
      <main className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 md:py-16">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Geomacro Global Risk
            </p>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
              {unavailable ? "Verified risk package temporarily unavailable" : "Refreshing verified readings"}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
              {unavailable
                ? "Geomacro could not read the verified Global Risk continuity package. No zero-risk or synthetic substitute is shown."
                : "Geomacro is checking the verified Global Risk data path. No zero-risk or synthetic substitute is shown while the reading is recovered."}
            </p>
          </div>
          <Button type="button" variant="outline" onClick={risk.retry} className="gap-2">
            <RefreshCw className="h-4 w-4" /> Retry
          </Button>
        </div>
        <div className="mt-8 grid gap-4 lg:grid-cols-3" aria-label="Refreshing verified risk indices">
          {[0, 1, 2].map((item) => (
            <div key={item} className="h-56 animate-pulse rounded-2xl border border-border/60 bg-card/30" />
          ))}
        </div>
      </main>
    );
  }

  const data = risk.data;
  const hasLastVerified = DOMAIN_INDEX_SPECS.some(
    (spec) => data.domainIndices[spec.key]?.readingStatus === "last_verified",
  );

  return (
    <main className="mx-auto w-full max-w-7xl px-4 pb-20 pt-10 sm:px-6 md:pt-14">
      <section className="border-b border-border/70 pb-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-primary">
              <ShieldCheck className="h-3.5 w-3.5" /> Verified public indices
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              {data.methodologyVersion}
            </span>
            {hasLastVerified ? (
              <span className="rounded-full border border-border/70 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                Last verified continuity
              </span>
            ) : null}
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={risk.retry} className="gap-2 text-muted-foreground">
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        </div>

        <div className="mt-7 max-w-4xl">
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl md:text-6xl">
            Three risks. Three separate indices.
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg">
            Geopolitical, macroeconomic and critical-mineral risk are shown separately, each with its own verified current or last-verified reading and same-methodology history.
          </p>
        </div>

        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          {DOMAIN_INDEX_SPECS.map((spec) => {
            const domain = data.domainIndices[spec.key];
            if (!domain) {
              return (
                <article key={spec.key} className="rounded-2xl border border-border/70 bg-card/45 p-6">
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{spec.name}</p>
                  <p className="mt-5 text-2xl font-semibold">Verified reading unavailable</p>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    No verified domain score is available. Geomacro does not substitute zero or a synthetic estimate.
                  </p>
                </article>
              );
            }

            const statusLabel = domain.readingStatus === "current" ? "Current verified" : "Last verified";
            return (
              <article key={spec.key} className="rounded-2xl border border-border/70 bg-card/55 p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{spec.name}</p>
                    <div className="mt-3 flex flex-wrap items-end gap-3">
                      <span className="text-5xl font-semibold tabular-nums text-foreground">
                        {domain.score}<span className="ml-1 text-sm font-normal text-muted-foreground">/100</span>
                      </span>
                      {domain.changePoints !== null ? <RiskTrend delta={domain.changePoints} /> : null}
                    </div>
                  </div>
                  <span className="rounded-full border border-primary/30 bg-primary/5 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-primary">
                    {statusLabel}
                  </span>
                </div>

                <div className="mt-3"><RiskBadge score={domain.score} /></div>
                <dl className="mt-6 grid grid-cols-2 gap-4">
                  <Metric label="Exact raw" value={fmt(domain.rawScore, 6)} />
                  <Metric label="Previous" value={domain.previousScore === null ? "—" : fmt(domain.previousScore, 1)} />
                  <Metric label="Evidence" value={String(domain.eventCount)} />
                  <Metric label="Stories" value={String(domain.independentStoryCount)} />
                  <Metric label="Sources" value={String(domain.sourceCount)} />
                  <Metric label="Confidence" value={domain.confidence === null ? "—" : `${Math.round(domain.confidence)}%`} />
                </dl>
                <p className="mt-5 border-t border-border/60 pt-4 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  {statusLabel} · {formatDate(domain.readingAsOf)}
                </p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="border-b border-border/70 py-10 sm:py-12">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">History</p>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">Compare each risk domain on its own scale</h2>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">
          Each chart uses only stored comparable verified category scores. Missing history stays unavailable rather than being reconstructed or zero-filled.
        </p>

        <div className="mt-7 mb-5 flex w-fit gap-1 rounded-lg border border-border/70 p-1">
          {TIMEFRAMES.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setTimeframe(item)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                timeframe === item ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {item}
            </button>
          ))}
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          {DOMAIN_INDEX_SPECS.map((spec) => {
            const domain = data.domainIndices[spec.key];
            const series = domain?.series[timeframe] ?? null;
            return (
              <article key={spec.key} className="rounded-2xl border border-border/70 bg-card/40 p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{spec.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {series?.low === null || series?.low === undefined
                        ? "Comparable history is unavailable"
                        : `${fmt(series.low, 1)} low · ${fmt(series.high ?? series.low, 1)} high`}
                    </p>
                  </div>
                  <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">{timeframe}</span>
                </div>
                <div className="mt-4">
                  {series?.buckets ? (
                    <RiskChart buckets={series.buckets} label={`${spec.name}, ${timeframe}`} height={220} />
                  ) : (
                    <div className="grid min-h-52 place-items-center text-center text-sm text-muted-foreground">
                      Comparable history is unavailable.
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="py-10 sm:py-12">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Integrity</p>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">One verified package, one traceable source snapshot</h2>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">
          The three displayed indices retain the canonical Global Risk proof lineage while remaining visually separate.
        </p>
        <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Verification" value={data.verificationStatus ?? "Unavailable"} />
          <MetricCard label="Snapshot as of" value={formatDate(data.snapshotAsOf)} />
          <MetricCard label="Snapshot ID" value={shortHash(data.snapshotId)} />
          <MetricCard label="Proof hash" value={shortHash(data.proofHash)} />
        </div>
        <p className="mt-6 max-w-4xl text-xs leading-6 text-muted-foreground">
          These indices are risk-intelligence signals. They are not market probabilities, investment recommendations or autonomous execution instructions.
        </p>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-sm font-medium text-foreground">{value}</dd>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card/40 p-5">
      <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="mt-2 break-all text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

function fmt(value: number, digits = 2) {
  return Number.isFinite(value) ? value.toFixed(digits) : "—";
}

function formatDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unknown verified time";
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(date);
}

function shortHash(value: string | null) {
  if (!value) return "Not stored";
  return value.length > 18 ? `${value.slice(0, 10)}…${value.slice(-6)}` : value;
}
