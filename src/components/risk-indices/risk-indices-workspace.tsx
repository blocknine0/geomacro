import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { usePublicRiskResearchActivity } from "@/lib/use-public-risk-research-activity";
import { PUBLIC_RESEARCH_INDEX_CATEGORIES } from "@/lib/risk-indices-public-research";
import { AlertTriangle, CheckCircle2, Fingerprint, RefreshCw, ShieldCheck } from "lucide-react";
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
    const unavailable = risk.status === "error";
    return (
      <main className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 md:py-16">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Geomacro Risk Indices
            </p>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
              {unavailable ? "Current certified Risk Indices unavailable" : "Checking certified Risk Indices"}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
              {unavailable
                ? "No current independently certified numerical package can be displayed right now. Public research activity is shown separately below."
                : "Checking the independently verified index package. Public research updates remain available below."}
            </p>
          </div>
          <Button type="button" variant="outline" onClick={risk.retry} className="gap-2">
            <RefreshCw className="h-4 w-4" /> Retry
          </Button>
        </div>

        {unavailable ? (
          <div className="mt-8 rounded-2xl border border-border/70 bg-card/40 p-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
              <div>
                <p className="font-medium text-foreground">No unverified fallback is being displayed.</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Recent source-dated Finds and automated internal research scores do not become numerical Risk Indices without independently certified index proof. Try the verified index service again to check for an accepted package.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-8 grid gap-4 lg:grid-cols-3" aria-label="Checking three certified risk indices">
            {PUBLIC_RESEARCH_INDEX_CATEGORIES.map((item) => (
              <div key={item.key} className="h-56 animate-pulse rounded-2xl border border-border/60 bg-card/30 p-6">
                <p className="font-mono text-xs text-muted-foreground">{item.name}</p>
                <p className="mt-8 text-sm text-muted-foreground">Checking independently verified reading</p>
              </div>
            ))}
          </div>
        )}
        {unavailable ? (
          <div className="mt-5 grid gap-4 lg:grid-cols-3" aria-label="Unavailable certified domain readings">
            {PUBLIC_RESEARCH_INDEX_CATEGORIES.map((item) => (
              <article key={item.key} className="rounded-2xl border border-border/70 bg-card/40 p-5">
                <p className="text-sm font-semibold">{item.name}</p>
                <p className="mt-3 text-sm text-muted-foreground">Certified numerical reading unavailable</p>
                <p className="mt-1 text-xs text-muted-foreground">No zero-risk or estimated score substituted.</p>
              </article>
            ))}
          </div>
        ) : null}
        <PublicResearchActivityPanel />
      </main>
    );
  }

  const data = risk.data;
  const hasLastVerified = data.indices.some(
    (index) => index.status === "available" && index.readingStatus === "last_verified",
  );
  const hasUnavailable = data.indices.some((index) => index.status === "unavailable");

  return (
    <main className="mx-auto w-full max-w-7xl px-4 pb-20 pt-10 sm:px-6 md:pt-14">
      <section className="border-b border-border/70 pb-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-primary">
              <ShieldCheck className="h-3.5 w-3.5" /> Verified snapshot only
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              {data.contractVersion}
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
            Follow Geopolitical, Macroeconomic and Critical Minerals risk separately. Inspect the dates, drivers and confidence behind each reading.
          </p>
          {(hasLastVerified || hasUnavailable || risk.error) ? (
            <p className="mt-4 max-w-3xl text-sm leading-6 text-muted-foreground">
              Each domain is evaluated independently. Historical readings retain their original dates; a missing certificate or expired source does not become a current score. Automated signed research prioritization is not an independently reviewed risk index.
            </p>
          ) : null}
        </div>

        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          {data.indices.map((index) => (
            <IndexCard key={index.key} index={index} />
          ))}
        </div>
      </section>

      <PublicResearchActivityPanel />
      <Section
        eyebrow="History"
        title="Compare each risk domain on its own scale"
        copy="Each chart uses stored comparable category scores when they are present in the verified public package. Missing history is left unavailable rather than reconstructed from the old combined index."
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
        copy="This public split is a verified category projection of the existing v1.2 versioned proof package. It does not rewrite historical snapshots or invent a second calculation path."
      >
        <div className="grid gap-4 md:grid-cols-3">
          <MethodCard title="Independent domain score" body="Each domain score is calculated inside its own evidence pool after confidence, recency, source-cap and story-cap controls." />
          <MethodCard title="No combined headline" body="The public workspace no longer asks users to interpret one blended geopolitical, macro and critical-mineral number." />
          <MethodCard title="No zero fallback" body="If a domain has no current verified reading, Geomacro does not manufacture a zero or synthetic estimate." />
        </div>
        <div className="mt-5 rounded-2xl border border-border/70 bg-muted/15 p-5 text-sm leading-7 text-muted-foreground">
          Parent versioned methodology: <span className="font-mono text-foreground">{data.parentMethodologyVersion}</span>. Proof scope: <span className="font-mono text-foreground">{data.proofScope}</span>. The next methodology generation can persist fully independent per-index proof objects without mutating the historical GRI v1.2 record.
        </div>
      </Section>

      <Section
        eyebrow="Integrity"
        title="One verified package, traceable to the exact source snapshot"
        copy="The three public indices retain the parent snapshot fingerprints so the projection remains reproducible and traceable during the migration from the historical combined GRI surface."
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

function PublicResearchActivityPanel() {
  const activity = usePublicRiskResearchActivity();
  return (
    <section className="border-b border-border/70 py-10 sm:py-12" aria-label="Public research activity, not risk scores">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Research activity</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">Recent developments by category</h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">
            Live public Finds use source-native publication dates. They are separate from certified numerical Risk Indices.
            Geomacro's signed internal prioritization does not certify factual impact, a current GRI score or payment eligibility.
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={activity.retry} className="gap-2">
          <RefreshCw className="h-4 w-4" /> Refresh activity
        </Button>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {PUBLIC_RESEARCH_INDEX_CATEGORIES.map((category) => {
          const row = activity.rows?.find(item => item.category === category.key);
          const ready = activity.status === "ready" && row !== undefined;
          return (
            <article key={category.key} className="rounded-2xl border border-border/70 bg-card/45 p-5">
              <p className="text-sm font-semibold">{category.name}</p>
              <p className="mt-3 text-2xl font-semibold tabular-nums">
                {ready ? row.count : "—"}
                {ready ? <span className="ml-2 text-xs font-normal text-muted-foreground">public Finds / 72h</span> : null}
              </p>
              <p className="mt-2 text-xs leading-6 text-muted-foreground">
                {activity.status === "loading" ? "Checking published research archive" :
                  !ready ? "Public research archive temporarily unavailable" :
                  row.count === 0 ? "No recent qualifying public Finds; not a zero-risk reading" :
                  row.lastNativePublishedAt ? `Latest original publication: ${formatDate(row.lastNativePublishedAt)}` :
                    "Source publication time unavailable"}
              </p>
              <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">No estimated risk score</p>
            </article>
          );
        })}
      </div>
      <Link to="/intelligence" className="mt-5 inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline">
        Explore published Intelligence
      </Link>
    </section>
  );
}

function IndexCard({ index }: { index: PublicRiskIndex }) {
  if (index.status !== "available" || index.score === null) {
    return (
      <article className="rounded-2xl border border-border/70 bg-card/45 p-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{index.name}</p>
        <p className="mt-5 text-2xl font-semibold">Verified reading unavailable</p>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          A verified domain score is not present in this package. Geomacro does not substitute zero or a synthetic estimate.
        </p>
      </article>
    );
  }

  const countsAvailable = index.eventCount > 0 || index.sourceCount > 0 || index.independentStoryCount > 0;
  const readingAge = index.readingAgeHours === null ? null : Math.max(0, Math.round(index.readingAgeHours));

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
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <RiskBadge score={index.score} />
        <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
          {index.readingStatus === "current"
            ? "Current verified"
            : `Last verified${readingAge === null ? "" : ` · ${readingAge}h old`}`}
        </span>
      </div>
      <dl className="mt-6 grid grid-cols-2 gap-4">
        <Metric label="Exact raw" value={index.rawScore === null ? "—" : fmt(index.rawScore, 6)} />
        <Metric label="Previous" value={index.previousScore === null ? "—" : fmt(index.previousScore, 1)} />
        <Metric label="Evidence" value={countsAvailable ? String(index.eventCount) : "—"} />
        <Metric label="Stories" value={countsAvailable ? String(index.independentStoryCount) : "—"} />
        <Metric label="Sources" value={countsAvailable ? String(index.sourceCount) : "—"} />
        <Metric label="Confidence" value={index.confidence === null ? "—" : `${Math.round(index.confidence)}%`} />
      </dl>
      {!countsAvailable ? (
        <p className="mt-4 text-xs leading-5 text-muted-foreground">
          Per-domain evidence counts are not present in this continuity package; no zero count is inferred.
        </p>
      ) : null}
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
