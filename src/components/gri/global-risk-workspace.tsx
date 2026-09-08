import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  CheckCircle2,
  Fingerprint,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { RiskBadge, RiskTrend } from "@/components/foundation/risk";
import { RiskChart } from "@/components/home/risk-chart";
import {
  GRI_METHODOLOGY,
  useGlobalRisk,
  type Timeframe,
} from "@/lib/use-global-risk";

const TIMEFRAMES: Timeframe[] = ["24H", "7D", "30D"];

export function GlobalRiskWorkspace() {
  const risk = useGlobalRisk();
  const [timeframe, setTimeframe] = useState<Timeframe>("7D");

  if (risk.status === "loading" && !risk.data) {
    return (
      <main className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 md:py-16">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Global Risk Index
        </p>
        <div className="mt-5 h-24 max-w-md animate-pulse rounded-2xl bg-muted/40" />
        <div className="mt-6 h-72 animate-pulse rounded-2xl border border-border/60 bg-card/30" />
      </main>
    );
  }

  if (!risk.data) {
    return (
      <main className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 md:py-16">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Global Risk Index
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight">Current verified GRI unavailable</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
          {risk.error?.message ?? "Geomacro could not load the canonical verified GRI reading."}
        </p>
        <Button type="button" variant="outline" onClick={risk.retry} className="mt-6 gap-2">
          <RefreshCw className="h-4 w-4" /> Retry canonical read
        </Button>
      </main>
    );
  }

  const data = risk.data;
  const delta = data.previous !== null ? data.score - data.previous : null;
  const series = data.series[timeframe];

  return (
    <main className="mx-auto w-full max-w-7xl px-4 pb-20 pt-10 sm:px-6 md:pt-14">
      <section className="border-b border-border/70 pb-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-primary">
              <ShieldCheck className="h-3.5 w-3.5" /> Verified public index
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              {data.methodologyVersion}
            </span>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={risk.retry} className="gap-2 text-muted-foreground">
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        </div>

        <div className="mt-7 grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,.85fr)] lg:items-end">
          <div>
            <h1 className="max-w-4xl text-4xl font-semibold tracking-tight sm:text-5xl md:text-6xl">
              Global Risk Index
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg">
              The canonical Geomacro index for current geopolitical, macro and critical-mineral risk. This page is the full verification workspace: current reading, history, exact change attribution, evidence quality, methodology and integrity fingerprints.
            </p>
          </div>

          <div className="rounded-2xl border border-border/70 bg-card/55 p-6">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              Current verified GRI
            </p>
            <div className="mt-2 flex flex-wrap items-end gap-3">
              <span className="text-6xl font-semibold tabular-nums text-foreground">
                {data.score}<span className="ml-1 text-base font-normal text-muted-foreground">/100</span>
              </span>
              {delta !== null ? <RiskTrend delta={delta} /> : null}
            </div>
            <div className="mt-3"><RiskBadge score={data.score} /></div>
            <dl className="mt-6 grid grid-cols-2 gap-4">
              <Metric label="Exact raw" value={fmt(data.rawScore, 6)} />
              <Metric label="Previous" value={data.previous === null ? "—" : String(data.previous)} />
              <Metric label="As of" value={formatDate(data.snapshotAsOf)} />
              <Metric label="Snapshot" value={shortHash(data.snapshotId)} mono />
            </dl>
          </div>
        </div>
      </section>

      <Section eyebrow="History" title="How global risk is moving" copy="Only comparable verified snapshots from the same current methodology are plotted here.">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1 rounded-lg border border-border/70 p-1">
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
          <p className="text-xs text-muted-foreground">
            Current window: {series.low === null ? "—" : `${series.low} low`} · {series.high === null ? "—" : `${series.high} high`}
          </p>
        </div>
        <div className="mt-5 rounded-2xl border border-border/70 bg-card/40 p-4 sm:p-5">
          {series.buckets ? (
            <RiskChart buckets={series.buckets} label={`Verified GRI, ${timeframe}`} height={300} />
          ) : (
            <div className="grid min-h-56 place-items-center text-center text-sm text-muted-foreground">
              Comparable {timeframe} history is still building.
            </div>
          )}
        </div>
      </Section>

      <Section eyebrow="Change attribution" title="What changed, and by how much" copy="GRI does not stop at the headline number. Each current domain exposes its score, normalized contribution and stored contribution-point change when a comparable prior snapshot exists.">
        {data.drivers.length ? (
          <div className="grid gap-4 lg:grid-cols-3">
            {data.drivers.map((driver) => (
              <article key={driver.category} className="rounded-2xl border border-border/70 bg-card/40 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                      {prettyDomain(driver.category)}
                    </p>
                    <p className="mt-2 text-3xl font-semibold tabular-nums">{driver.score}</p>
                  </div>
                  {driver.change !== null ? <RiskTrend delta={driver.change} /> : null}
                </div>
                <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary/75"
                    style={{ width: `${Math.max(2, Math.round(driver.contribution * 100))}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {Math.round(driver.contribution * 100)}% normalized GRI weight
                </p>
                {driver.topEvent ? (
                  <div className="mt-5 border-t border-border/60 pt-4">
                    <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">Leading stored event</p>
                    <p className="mt-2 text-sm font-medium leading-relaxed">{driver.topEvent.title}</p>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <Unavailable text="No comparable domain attribution is stored for this snapshot." />
        )}
      </Section>

      <Section eyebrow="Evidence quality" title="What supports this reading" copy="Score, coverage and confidence are kept separate so users can judge how much evidence supports the published index.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Stat label="Evidence articles" value={String(data.eventCount)} />
          <Stat label="Independent stories" value={String(data.independentStoryCount)} />
          <Stat label="Sources" value={data.sourceCount === null ? "—" : String(data.sourceCount)} />
          <Stat label="Coverage" value={`${Math.round(data.coverage * 100)}%`} />
          <Stat label="Weighted confidence" value={data.weightedConfidence === null ? "—" : `${Math.round(data.weightedConfidence)}%`} />
        </div>

        <div className="mt-6 overflow-hidden rounded-2xl border border-border/70 bg-card/35">
          {data.recentEvents.length ? data.recentEvents.slice(0, 10).map((event) => (
            <article key={event.id} className="grid gap-3 border-b border-border/60 px-4 py-4 last:border-0 md:grid-cols-[minmax(0,1.5fr)_150px_130px] md:items-center">
              <div className="min-w-0">
                <Link to="/event/$eventId" params={{ eventId: event.id }} className="text-sm font-medium leading-relaxed hover:text-primary">
                  {event.source_title ?? "Stored intelligence event"}
                </Link>
                <p className="mt-1 text-xs text-muted-foreground">
                  {event.source_name ?? event.source_domain ?? "Source recorded"} · {formatDate(event.published_at ?? event.created_at)}
                </p>
              </div>
              <Metric label="Severity" value={event.severity === null ? "—" : fmt(event.severity, 1)} />
              <Metric label="Confidence" value={event.confidence === null ? "—" : `${Math.round(event.confidence)}%`} />
            </article>
          )) : (
            <div className="p-5"><Unavailable text="No current evidence rows are available for this verified window." /></div>
          )}
        </div>
      </Section>

      <Section eyebrow="Methodology" title="How this index is calculated" copy="The live score is deterministic and versioned. Repeated reporting of one development cannot create unlimited influence.">
        <div className="grid gap-4 lg:grid-cols-4">
          <MethodStep number="01" title="Eligible evidence" body="Only current-contract geopolitical, macro and critical-mineral evidence enters GRI v1.2." />
          <MethodStep number="02" title="Confidence + decay" body="Event influence reflects stored confidence and exponential recency decay over the production lookback." />
          <MethodStep number="03" title="Source + story caps" body="One publisher and repeated coverage of the same development are capped before aggregation." />
          <MethodStep number="04" title="Domain aggregation" body="Active domains are normalized and combined into the published raw and display score." />
        </div>
        <div className="mt-6 rounded-2xl border border-border/70 bg-muted/15 p-5 text-sm leading-7 text-muted-foreground">
          {GRI_METHODOLOGY.definition} {GRI_METHODOLOGY.weighting} {GRI_METHODOLOGY.notProbability}
        </div>
        <Button asChild variant="outline" className="mt-5 gap-2">
          <Link to="/docs/gri-architecture">Read the full GRI architecture <ArrowRight className="h-4 w-4" /></Link>
        </Button>
      </Section>

      <Section eyebrow="Integrity" title="Verify the published snapshot" copy="These fingerprints identify the exact methodology, input set, accepted evidence, calculation and proof package behind the reading above.">
        <div className="grid gap-4 md:grid-cols-2">
          <HashCard label="Proof hash" value={data.proofHash} />
          <HashCard label="Methodology hash" value={data.methodologyHash} />
          <HashCard label="Input hash" value={data.inputHash} />
          <HashCard label="Evidence hash" value={data.evidenceHash} />
          <HashCard label="Calculation hash" value={data.calculationHash} />
          <HashCard label="Disposition hash" value={data.dispositionHash} />
          <HashCard label="Change hash" value={data.changeHash} />
          <HashCard label="Snapshot ID" value={data.snapshotId} />
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <IntegrityCheck label="Verification status" value={data.verificationStatus ?? "Unavailable"} />
          <IntegrityCheck label="Score reconciliation residual" value={data.reconciliationResidual === null ? "Not stored" : fmt(data.reconciliationResidual, 12)} />
          <IntegrityCheck label="Change residual" value={data.changeResidual === null ? "Not stored" : fmt(data.changeResidual, 12)} />
        </div>

        <p className="mt-6 max-w-4xl text-xs leading-6 text-muted-foreground">
          GRI is an aggregate risk-intelligence signal. It is not a market probability, investment recommendation or autonomous execution instruction. Validation evidence is reported separately from the live score.
        </p>
      </Section>
    </main>
  );
}

function Section({
  eyebrow,
  title,
  copy,
  children,
}: {
  eyebrow: string;
  title: string;
  copy: string;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-border/70 py-10 last:border-0 sm:py-12">
      <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">{eyebrow}</p>
      <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
      <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">{copy}</p>
      <div className="mt-7">{children}</div>
    </section>
  );
}

function Metric({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">{label}</dt>
      <dd className={`mt-1 break-words text-sm text-foreground ${mono ? "font-mono text-xs" : "font-medium"}`}>{value}</dd>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card/40 p-5">
      <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function MethodStep({ number, title, body }: { number: string; title: string; body: string }) {
  return (
    <article className="rounded-2xl border border-border/70 bg-card/35 p-5">
      <span className="font-mono text-[10px] text-primary">{number}</span>
      <h3 className="mt-3 font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
    </article>
  );
}

function HashCard({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card/35 p-4">
      <div className="flex items-center gap-2">
        <Fingerprint className="h-4 w-4 text-primary" />
        <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      </div>
      <code className="mt-3 block break-all text-[11px] leading-5 text-foreground/85">{value ?? "Unavailable"}</code>
    </div>
  );
}

function IntegrityCheck({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-background/30 p-4">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">{label}</span>
      </div>
      <p className="mt-2 font-mono text-xs text-muted-foreground">{value}</p>
    </div>
  );
}

function Unavailable({ text }: { text: string }) {
  return <p className="text-sm leading-6 text-muted-foreground">{text}</p>;
}

function fmt(value: number, digits = 2) {
  return Number.isFinite(value) ? value.toFixed(digits) : "—";
}

function shortHash(value: string) {
  return value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unavailable";
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

function prettyDomain(value: string) {
  if (value === "rare_earth") return "Critical minerals";
  return value.replace(/_/g, " ");
}
