import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  type GriHistoryPoint,
  type GriProofPackage,
  loadLatestGriProofPackage,
  loadRecentGriHistory,
  numberOrNull,
} from "@/lib/gri-proof-data";

export const Route = createFileRoute("/global-risk")({
  component: GlobalRiskPage,
});

function GlobalRiskPage() {
  const [proof, setProof] = useState<GriProofPackage | null>(null);
  const [history, setHistory] = useState<GriHistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Global Risk Index | Geomacro";

    let cancelled = false;

    Promise.all([
      loadLatestGriProofPackage(),
      loadRecentGriHistory(90),
    ])
      .then(([nextProof, nextHistory]) => {
        if (cancelled) return;
        setProof(nextProof);
        setHistory(nextHistory);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          err instanceof Error
            ? err.message
            : "Unable to load the verified Global Risk Index.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <main className="mx-auto max-w-7xl px-5 py-16 md:px-8">
        <p className="text-sm text-muted-foreground">
          Loading the latest verified GRI snapshot…
        </p>
      </main>
    );
  }

  if (error || !proof) {
    return (
      <main className="mx-auto max-w-7xl px-5 py-16 md:px-8">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Global Risk Index
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">
          Verified snapshot unavailable
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
          {error ?? "No verified GRI snapshot is currently available."}
        </p>
      </main>
    );
  }

  return <GriPage proof={proof} history={history} />;
}

function GriPage({
  proof,
  history,
}: {
  proof: GriProofPackage;
  history: GriHistoryPoint[];
}) {
  const s = proof.snapshot;
  const raw = numberOrNull(s.raw_score);
  const previousRaw = numberOrNull(s.previous_raw_score);
  const change = numberOrNull(s.change_points);
  const coverage = numberOrNull(s.coverage);
  const confidence = normalizePercent(numberOrNull(s.weighted_confidence));
  const why = s.explanation?.why;
  const categories = categoryRows(s.category_breakdown);

  const latestEvidenceAt = useMemo(() => {
    const times = proof.contributions
      .map((row) => new Date(row.observed_at).getTime())
      .filter(Number.isFinite);

    return times.length ? new Date(Math.max(...times)).toISOString() : null;
  }, [proof.contributions]);

  return (
    <main className="mx-auto max-w-7xl px-5 pb-24 pt-12 md:px-8 md:pt-16">
      <section className="border-b border-border pb-12">
        <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
          Global Risk Index · Verified intelligence
        </p>

        <div className="mt-6 grid gap-8 lg:grid-cols-[1.4fr_1fr] lg:items-end">
          <div>
            <h1 className="max-w-4xl text-4xl font-semibold tracking-tight md:text-6xl">
              A transparent measure of current global geopolitical and macro risk.
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-7 text-muted-foreground">
              GRI converts provenance-complete evidence into a deterministic,
              versioned risk score. Every published snapshot can be traced back
              through its evidence, weighting, story correlation, change
              attribution and cryptographic proof.
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-muted-foreground">
                  Current verified GRI
                </p>
                <div className="mt-2 text-6xl font-semibold tabular-nums">
                  {s.display_score ?? "—"}
                </div>
              </div>

              <span className="rounded-full border border-border px-3 py-1 text-xs font-medium">
                {s.verification_status === "verified"
                  ? "Verified snapshot"
                  : s.verification_status ?? "Unverified"}
              </span>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-4 text-sm">
              <Metric
                label="Exact raw score"
                value={formatNumber(raw, 6)}
              />
              <Metric
                label="Change"
                value={signed(change)}
              />
              <Metric
                label="Previous"
                value={formatNumber(previousRaw, 6)}
              />
              <Metric
                label="As of"
                value={formatDate(s.as_of)}
              />
            </div>
          </div>
        </div>
      </section>

      <Section
        eyebrow="Change attribution"
        title="What changed and why"
        copy="The published score movement is decomposed into the exact category and event-level contributions that changed between comparable verified snapshots."
      >
        {s.explanation?.baseline ? (
          <InfoBox>
            This is a baseline snapshot. There is no comparable prior verified
            snapshot for change attribution.
          </InfoBox>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-border p-5">
              <h3 className="font-medium">Category contribution changes</h3>
              <div className="mt-5 space-y-4">
                {(why?.topCategoryChanges ?? []).length ? (
                  why!.topCategoryChanges!.map((row) => (
                    <DeltaRow
                      key={row.category}
                      label={titleCase(row.category)}
                      value={Number(row.deltaPoints ?? 0)}
                      detail={`${formatNumber(
                        row.previousContribution,
                        3,
                      )} → ${formatNumber(row.currentContribution, 3)} pts`}
                    />
                  ))
                ) : (
                  <EmptyState text="No material category changes are available for this snapshot." />
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-border p-5">
              <h3 className="font-medium">Largest event-level changes</h3>
              <div className="mt-5 space-y-4">
                {(why?.topEventChanges ?? []).length ? (
                  why!.topEventChanges!.slice(0, 6).map((row) => (
                    <DeltaRow
                      key={`${row.eventId}-${row.kind}`}
                      label={row.sourceTitle || row.eventId}
                      value={Number(row.deltaPoints ?? 0)}
                      detail={`${titleCase(row.kind)} · ${titleCase(
                        row.category ?? "uncategorized",
                      )}`}
                    />
                  ))
                ) : (
                  <EmptyState text="No material event changes are available for this snapshot." />
                )}
              </div>
            </div>
          </div>
        )}

        <div className="mt-6 rounded-2xl border border-border p-5">
          <div className="grid gap-4 sm:grid-cols-4">
            <Metric
              label="Previous raw"
              value={formatNumber(previousRaw, 6)}
            />
            <Metric
              label="Exact delta"
              value={signed(change, 6)}
            />
            <Metric
              label="Current raw"
              value={formatNumber(raw, 6)}
            />
            <Metric
              label="Change residual"
              value={formatNumber(numberOrNull(s.change_residual), 12)}
            />
          </div>
        </div>
      </Section>

      <Section
        eyebrow="Composition"
        title="Risk composition"
        copy="The index exposes the active risk domains, their normalized weights and their exact contribution to the published score."
      >
        <div className="overflow-hidden rounded-2xl border border-border">
          <div className="grid grid-cols-[1.4fr_repeat(3,1fr)] gap-3 border-b border-border bg-muted/30 px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <span>Domain</span>
            <span>Score</span>
            <span>Weight</span>
            <span>Contribution</span>
          </div>

          {categories.length ? (
            categories.map((row) => (
              <div
                key={row.category}
                className="grid grid-cols-[1.4fr_repeat(3,1fr)] gap-3 border-b border-border px-4 py-4 text-sm last:border-b-0"
              >
                <span className="font-medium">{titleCase(row.category)}</span>
                <span className="tabular-nums">
                  {formatNumber(row.score, 2)}
                </span>
                <span className="tabular-nums">
                  {formatPercent(row.normalizedWeight)}
                </span>
                <span className="tabular-nums">
                  {formatNumber(row.contributionPoints, 3)}
                </span>
              </div>
            ))
          ) : (
            <div className="p-5">
              <EmptyState text="No category breakdown is available." />
            </div>
          )}
        </div>
      </Section>

      <Section
        eyebrow="Evidence"
        title="Evidence and confidence"
        copy="GRI separates the score itself from evidence coverage and confidence so buyers can judge how much information supports the published result."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard label="Evidence articles" value={String(s.event_count)} />
          <StatCard
            label="Independent stories"
            value={String(s.independent_story_count)}
          />
          <StatCard label="Sources" value={String(s.source_count)} />
          <StatCard
            label="Evidence coverage"
            value={formatPercent(coverage)}
          />
          <StatCard
            label="Weighted confidence"
            value={formatPercent(confidence)}
          />
        </div>

        <p className="mt-5 text-sm text-muted-foreground">
          Latest evidence observation:{" "}
          <span className="text-foreground">
            {formatDate(latestEvidenceAt)}
          </span>
        </p>

        <div className="mt-6 overflow-hidden rounded-2xl border border-border">
          {proof.contributions.slice(0, 8).map((row) => (
            <div
              key={row.event_id}
              className="grid gap-2 border-b border-border px-4 py-4 last:border-b-0 md:grid-cols-[1.5fr_.7fr_.7fr]"
            >
              <div>
                <p className="text-sm font-medium">
                  {row.source_title || row.story_canonical_label || row.event_id}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {titleCase(row.category)} ·{" "}
                  {row.story_canonical_label || "Independent evidence"}
                </p>
              </div>
              <Metric
                label="Confidence"
                value={formatPercent(normalizePercent(numberOrNull(row.confidence)))}
              />
              <Metric
                label="GRI contribution"
                value={`${formatNumber(numberOrNull(row.contribution_points), 4)} pts`}
              />
            </div>
          ))}
        </div>
      </Section>

      <Section
        eyebrow="Methodology"
        title="How the GRI is calculated"
        copy="The production calculation is deterministic and versioned. Repeated reporting of one underlying development cannot multiply its influence."
      >
        <div className="grid gap-4 lg:grid-cols-4">
          <MethodStep
            number="01"
            title="Time and confidence"
            text="Each eligible event receives confidence × exponential time-decay weight over the production lookback window."
          />
          <MethodStep
            number="02"
            title="Source cap"
            text="Evidence from one source is capped before category aggregation so one publisher cannot dominate a domain."
          />
          <MethodStep
            number="03"
            title="Story cap"
            text="Articles describing the same underlying development are grouped into an immutable story cluster. Repetition across publishers cannot create multiple independent risk budgets."
          />
          <MethodStep
            number="04"
            title="Weighted GRI"
            text="Active category scores are normalized and aggregated into the final raw score, which is then published with the complete proof envelope."
          />
        </div>

        <div className="mt-6 rounded-2xl border border-border bg-muted/20 p-5 font-mono text-xs leading-6">
          <div>event weight = (confidence / 100) × 2^(-ageHours / 24)</div>
          <div>source effective weight = min(1, source raw weight)</div>
          <div>
            story effective weight = min(1, strongest post-source source weight)
          </div>
          <div>GRI = Σ normalized category contribution</div>
        </div>

        <a
          href="/docs/gri-architecture"
          className="mt-5 inline-flex text-sm font-medium underline underline-offset-4"
        >
          Read the full GRI architecture
        </a>
      </Section>

      <Section
        eyebrow="Integrity"
        title="Verify this GRI"
        copy="The published snapshot carries cryptographic fingerprints for the methodology, inputs, evidence, calculation, change attribution and complete proof package."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Methodology" value={s.methodology_version} />
          <StatCard label="Proof contract" value={s.proof_version ?? "—"} />
          <StatCard
            label="Verification"
            value={s.verification_status ?? "—"}
          />
          <StatCard
            label="Independent stories"
            value={String(s.independent_story_count)}
          />
        </div>

        <div className="mt-6 rounded-2xl border border-border">
          <HashRow label="Snapshot ID" value={s.id} />
          <HashRow label="Methodology hash" value={s.methodology_hash} />
          <HashRow label="Input hash" value={s.input_hash} />
          <HashRow label="Evidence hash" value={s.evidence_hash} />
          <HashRow label="Calculation hash" value={s.calculation_hash} />
          <HashRow label="Change hash" value={s.change_hash} />
          <HashRow label="Complete proof hash" value={s.proof_hash} />
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Metric
            label="Calculation reconciliation residual"
            value={formatNumber(
              numberOrNull(s.reconciliation_residual),
              12,
            )}
          />
          <Metric
            label="Change reconciliation residual"
            value={formatNumber(numberOrNull(s.change_residual), 12)}
          />
        </div>
      </Section>

      <Section
        eyebrow="History"
        title="Verified GRI history"
        copy="Only published snapshots that satisfy the current methodology, proof and verification contract appear in this series."
      >
        <HistoryChart history={history} />
      </Section>

      <Section
        eyebrow="Limitations"
        title="Methodology and interpretation"
        copy="GRI is an explainable risk-intelligence measure, not a guarantee of future market outcomes."
      >
        <div className="grid gap-5 lg:grid-cols-2">
          <InfoBox>
            The live index describes the current evidence-weighted risk state.
            Reproducibility and cryptographic verification establish calculation
            integrity, not predictive power.
          </InfoBox>
          <InfoBox>
            Retrospective replay is explicitly separated from live
            out-of-sample evidence. Historical reconstruction must not be
            presented as proof that Geomacro emitted those scores in real time.
          </InfoBox>
        </div>

        {proof.validationRun ? (
          <div className="mt-6 rounded-2xl border border-border p-5">
            <p className="text-sm font-medium">Latest validation evidence</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Mode:{" "}
              <span className="text-foreground">
                {proof.validationRun.evidence_mode === "live_oos"
                  ? "Live out-of-sample"
                  : "Retrospective replay"}
              </span>
              {" · "}
              Samples:{" "}
              <span className="text-foreground">
                {proof.validationRun.sample_count}
              </span>
              {" · "}
              Benchmarks:{" "}
              <span className="text-foreground">
                {proof.validationRun.benchmark_count}
              </span>
            </p>
          </div>
        ) : null}
      </Section>

      <section className="mt-16 rounded-3xl border border-border bg-card p-7 md:p-10">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Professional intelligence
        </p>
        <h2 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight">
          Use the same verified risk context inside investment, treasury,
          supply-chain and machine decision workflows.
        </h2>
        <p className="mt-4 max-w-3xl text-sm leading-6 text-muted-foreground">
          Risk API and Risk Gate are available as private-pilot commercial
          surfaces. Geomacro provides structured decision context while the
          customer retains control of the final policy or action.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <a
            href="/institutional"
            className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background"
          >
            For Institutions
          </a>
          <a
            href="/contact"
            className="rounded-full border border-border px-5 py-2.5 text-sm font-medium"
          >
            Request a private pilot
          </a>
        </div>
      </section>
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
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-border py-12 md:py-16">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
        {eyebrow}
      </p>
      <h2 className="mt-3 text-2xl font-semibold tracking-tight md:text-3xl">
        {title}
      </h2>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
        {copy}
      </p>
      <div className="mt-7">{children}</div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium tabular-nums">{value}</p>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border p-5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-2 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function DeltaRow({
  label,
  value,
  detail,
}: {
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <div className="flex items-start justify-between gap-5">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{label}</p>
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      </div>
      <span className="shrink-0 text-sm font-medium tabular-nums">
        {signed(value, 3)}
      </span>
    </div>
  );
}

function MethodStep({
  number,
  title,
  text,
}: {
  number: string;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-2xl border border-border p-5">
      <p className="text-xs font-medium text-muted-foreground">{number}</p>
      <h3 className="mt-4 font-medium">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
    </div>
  );
}

function HashRow({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div className="grid gap-2 border-b border-border px-4 py-4 last:border-b-0 md:grid-cols-[180px_1fr]">
      <span className="text-xs text-muted-foreground">{label}</span>
      <code className="break-all text-xs">{value || "—"}</code>
    </div>
  );
}

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-muted/20 p-5 text-sm leading-6 text-muted-foreground">
      {children}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="text-sm text-muted-foreground">{text}</p>;
}

function HistoryChart({ history }: { history: GriHistoryPoint[] }) {
  const points = history
    .map((row) => ({
      ...row,
      score: numberOrNull(row.raw_score),
    }))
    .filter(
      (row): row is GriHistoryPoint & { score: number } =>
        row.score !== null && row.score >= 0 && row.score <= 100,
    );

  if (points.length < 2) {
    return <InfoBox>Not enough verified snapshots are available to draw history yet.</InfoBox>;
  }

  const polyline = points
    .map((row, index) => {
      const x = points.length === 1 ? 0 : (index / (points.length - 1)) * 100;
      const y = 26 - (row.score / 100) * 24;
      return `${x.toFixed(3)},${y.toFixed(3)}`;
    })
    .join(" ");

  const latest = points[points.length - 1];
  const earliest = points[0];

  return (
    <div className="rounded-2xl border border-border p-5">
      <svg
        viewBox="0 0 100 28"
        role="img"
        aria-label="Verified Global Risk Index history"
        className="h-56 w-full overflow-visible"
        preserveAspectRatio="none"
      >
        <line
          x1="0"
          y1="2"
          x2="100"
          y2="2"
          stroke="currentColor"
          opacity="0.08"
        />
        <line
          x1="0"
          y1="14"
          x2="100"
          y2="14"
          stroke="currentColor"
          opacity="0.08"
        />
        <line
          x1="0"
          y1="26"
          x2="100"
          y2="26"
          stroke="currentColor"
          opacity="0.08"
        />
        <polyline
          points={polyline}
          fill="none"
          stroke="currentColor"
          strokeWidth="0.7"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <div className="mt-4 flex justify-between gap-4 text-xs text-muted-foreground">
        <span>
          {formatDate(earliest.as_of)} · {formatNumber(earliest.score, 2)}
        </span>
        <span>
          {formatDate(latest.as_of)} · {formatNumber(latest.score, 2)}
        </span>
      </div>
    </div>
  );
}

function categoryRows(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .filter(
      (row): row is Record<string, unknown> =>
        Boolean(row) && typeof row === "object" && !Array.isArray(row),
    )
    .map((row) => ({
      category: String(row.category ?? "unknown"),
      score: numberOrNull(row.score),
      normalizedWeight: numberOrNull(row.normalizedWeight),
      contributionPoints: numberOrNull(row.contributionPoints),
    }));
}

function normalizePercent(value: number | null) {
  if (value === null) return null;
  return Math.abs(value) <= 1 ? value : value / 100;
}

function formatNumber(value: number | null, digits = 2) {
  return value === null || !Number.isFinite(value)
    ? "—"
    : value.toFixed(digits);
}

function formatPercent(value: number | null) {
  return value === null || !Number.isFinite(value)
    ? "—"
    : `${(value * 100).toFixed(1)}%`;
}

function signed(value: number | null, digits = 2) {
  if (value === null || !Number.isFinite(value)) return "—";
  if (value === 0) return value.toFixed(digits);
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(date);
}

function titleCase(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
