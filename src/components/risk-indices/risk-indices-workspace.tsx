import { useState, type ReactNode } from "react";
import { CheckCircle2, Fingerprint, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RiskBadge, RiskTrend } from "@/components/foundation/risk";
import { RiskChart } from "@/components/home/risk-chart";
import { useRiskIndices } from "@/lib/use-risk-indices";
import type { PublicRiskIndex } from "@/lib/risk-indices.types";
import type { Timeframe } from "@/lib/global-risk.types";

const TIMEFRAMES: Timeframe[] = ["24H", "7D", "30D"];

export function RiskIndicesWorkspace() {
  const risk = useRiskIndices();
  const [timeframe, setTimeframe] = useState<Timeframe>("7D");

  if (!risk.data) {
    return (
      <main className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 md:py-16">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Geomacro Risk Indices
            </p>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
              Refreshing verified readings
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
              Geomacro is checking the verified public data path. No zero-risk or synthetic substitute is shown while a current reading is being recovered.
            </p>
          </div>
          <Button type="button" variant="outline" onClick={risk.retry} className="gap-2">
            <RefreshCw className="h-4 w-4" /> Refresh
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

  return (
    <main className="mx-auto w-full max-w-7xl px-4 pb-20 pt-10 sm:px-6 md:pt-14">
      <section className="border-b border-border/70 pb-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-primary">
              <ShieldCheck className="h-3.5 w-3.5" /> Verified public indices
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              {data.contractVersion}
            </span>
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
            Geopolitical, macroeconomic and critical-mineral risk are presented separately instead of being compressed into one combined headline score. Each index remains tied to the verified evidence, source controls and proof lineage behind the current audited methodology.
          </p>
        </div>

        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          {data.indices.map((index) => (
            <IndexCard key={index.key} index={index} />
          ))}
        </div>
      </section>

      <Section
        eyebrow="History"
        title="Compare each risk domain on its own scale"
        copy="Each chart uses the stored category score from comparable verified snapshots. A missing domain has no current verified reading and is never converted into a zero-risk value."
      >
        <div className="mb-5 flex w-fit gap-1 rounded-lg border border-border/70 p-1">
          {TIMEFRAMES.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setTimeframe(item)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                timeframe === item
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {item}
            </button>
          ))}
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          {data.indices.map((index) => {
            const series = index.series[timeframe];
            return (
              <article key={index.key} className="rounded-2xl border border-border/70 bg-card/40 p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{index.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {series.low === null ? "Comparable history is still building" : `${fmt(series.low, 1)} low · ${fmt(series.high, 1)} high`}
                    </p>
                  </div>
                  <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">{timeframe}</span>
                </div>
                <div className="mt-4">
                  {series.buckets ? (
                    <RiskChart buckets={series.buckets} label={`${index.name}, ${timeframe}`} height={220} />
                  ) : (
                    <div className="grid min-h-52 place-items-center text-center text-sm text-muted-foreground">
                      Comparable history is still building.
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </Section>

      <Section
        eyebrow="Methodology boundary"
        title="Separated presentation, preserved proof"
        copy="This public split is a verified category projection of the existing v1.2 audit package. It does not rewrite historical snapshots or invent a second calculation path."
      >
        <div className="grid gap-4 md:grid-cols-3">
          <MethodCard title="Independent domain score" body="Each domain score is calculated inside its own evidence pool after confidence, recency, source-cap and story-cap controls." />
          <MethodCard title="No combined headline" body="The public workspace no longer asks users to interpret one blended geopolitical, macro and critical-mineral number." />
          <MethodCard title="No zero fallback" body="If a domain has no current verified reading, Geomacro does not manufacture a zero or synthetic estimate." />
        </div>
        <div className="mt-5 rounded-2xl border border-border/70 bg-muted/15 p-5 text-sm leading-7 text-muted-foreground">
          Parent audited methodology: <span className="font-mono text-foreground">{data.parentMethodologyVersion}</span>. Proof scope: <span className="font-mono text-foreground">{data.proofScope}</span>. The next methodology generation can persist fully independent per-index proof objects without mutating the historical GRI v1.2 record.
        </div>
      </Section>

      <Section
        eyebrow="Integrity"
        title="One verified package, traceable to the exact source snapshot"
        copy="The three public indices retain the parent snapshot fingerprints so the projection remains reproducible and auditable during the migration from the historical combined GRI surface."
      >
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

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <IntegrityCheck label="Verification" value={data.verificationStatus} />
          <IntegrityCheck label="As of" value={formatDate(data.snapshotAsOf)} />
          <IntegrityCheck label="Score residual" value={data.reconciliationResidual === null ? "Not stored" : fmt(data.reconciliationResidual, 12)} />
          <IntegrityCheck label="Change residual" value={data.changeResidual === null ? "Not stored" : fmt(data.changeResidual, 12)} />
        </div>

        <p className="mt-6 max-w-4xl text-xs leading-6 text-muted-foreground">
          These indices are risk-intelligence signals. They are not market probabilities, investment recommendations or autonomous execution instructions.
        </p>
      </Section>
    </main>
  );
}

function IndexCard({ index }: { index: PublicRiskIndex }) {
  if (index.status !== "available" || index.score === null) {
    return (
      <article className="rounded-2xl border border-border/70 bg-card/45 p-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{index.name}</p>
        <p className="mt-5 text-2xl font-semibold">Refreshing verified reading</p>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          A current verified domain score is not present in this package. Geomacro does not substitute zero or a synthetic estimate.
        </p>
      </article>
    );
  }

  return (
    <article className="rounded-2xl border border-border/70 bg-card/55 p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{index.name}</p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <span className="text-5xl font-semibold tabular-nums">
              {index.score}<span className="ml-1 text-sm font-normal text-muted-foreground">/100</span>
            </span>
            {index.changePoints !== null ? <RiskTrend delta={index.changePoints} /> : null}
          </div>
        </div>
        <CheckCircle2 className="h-5 w-5 text-primary" />
      </div>
      <div className="mt-3"><RiskBadge score={index.score} /></div>
      <dl className="mt-6 grid grid-cols-2 gap-4">
        <Metric label="Exact raw" value={index.rawScore === null ? "—" : fmt(index.rawScore, 6)} />
        <Metric label="Previous" value={index.previousScore === null ? "—" : fmt(index.previousScore, 1)} />
        <Metric label="Evidence" value={String(index.eventCount)} />
        <Metric label="Stories" value={String(index.independentStoryCount)} />
        <Metric label="Sources" value={String(index.sourceCount)} />
        <Metric label="Confidence" value={index.confidence === null ? "—" : `${Math.round(index.confidence)}%`} />
      </dl>
      {index.topEvent ? (
        <div className="mt-5 border-t border-border/60 pt-4">
          <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">Leading verified event</p>
          <p className="mt-2 text-sm font-medium leading-relaxed">{index.topEvent.title}</p>
        </div>
      ) : null}
    </article>
  );
}

function Section({ eyebrow, title, copy, children }: { eyebrow: string; title: string; copy: string; children: ReactNode }) {
  return (
    <section className="border-b border-border/70 py-10 last:border-0 sm:py-12">
      <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">{eyebrow}</p>
      <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
      <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">{copy}</p>
      <div className="mt-7">{children}</div>
    </section>
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

function MethodCard({ title, body }: { title: string; body: string }) {
  return (
    <article className="rounded-2xl border border-border/70 bg-card/40 p-5">
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-3 text-sm leading-7 text-muted-foreground">{body}</p>
    </article>
  );
}

function HashCard({ label, value }: { label: string; value: string | null }) {
  return (
    <article className="rounded-2xl border border-border/70 bg-card/35 p-5">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Fingerprint className="h-4 w-4" />
        <p className="font-mono text-[9px] uppercase tracking-[0.14em]">{label}</p>
      </div>
      <p className="mt-3 break-all font-mono text-xs leading-6 text-foreground">{value ?? "Not stored"}</p>
    </article>
  );
}

function IntegrityCheck({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card/35 p-5">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-primary" />
        <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      </div>
      <p className="mt-2 break-words text-sm font-medium">{value}</p>
    </div>
  );
}

function fmt(value: number | null, digits: number) {
  return value === null || !Number.isFinite(value) ? "—" : value.toFixed(digits);
}

function formatDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Not recorded";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
