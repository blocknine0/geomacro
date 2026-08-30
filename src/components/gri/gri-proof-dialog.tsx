import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  ExternalLink,
  FileCheck2,
  Fingerprint,
  FlaskConical,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { GlobalRisk } from "@/lib/use-global-risk";
import {
  loadGriProofPackage,
  numberOrNull,
  type GriContributionProof,
  type GriProofPackage,
} from "@/lib/gri-proof-data";
import { cn } from "@/lib/utils";

export function GriProofDialog({ risk }: { risk: GlobalRisk }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proof, setProof] = useState<GriProofPackage | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setProof(null);
    setError(null);
  }, [risk.snapshotId]);

  useEffect(() => {
    if (!open || proof || loading) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void loadGriProofPackage(risk.snapshotId)
      .then((value) => {
        if (!cancelled) setProof(value);
      })
      .catch((e) => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Unable to load the proof package.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, proof, loading, risk.snapshotId, attempt]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <ShieldCheck className="h-4 w-4" aria-hidden />
          Verify this GRI
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-1rem)] max-w-6xl overflow-y-auto p-0 sm:w-[calc(100vw-2rem)]">
        <DialogHeader className="border-b border-border/60 px-5 pb-4 pt-5 pr-12 sm:px-6 sm:pt-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
              Public proof package
            </span>
            <span className="font-mono text-[10px] text-muted-foreground">
              {risk.methodologyVersion}
            </span>
          </div>
          <DialogTitle className="mt-2 text-2xl">
            Why {risk.score}, how it was calculated, and the proof
          </DialogTitle>
          <DialogDescription className="max-w-3xl leading-relaxed">
            This detail stays hidden during normal use. Open it when you want the exact score
            decomposition, score-change attribution, source/model provenance, integrity hashes, or
            empirical validation status.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="grid min-h-72 place-items-center px-6 py-16">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Loading immutable proof
              ledger…
            </div>
          </div>
        ) : error ? (
          <div className="px-6 py-12">
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-5">
              <p className="font-medium text-foreground">Proof package unavailable</p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{error}</p>
              <Button
                className="mt-4"
                variant="outline"
                onClick={() => {
                  setError(null);
                  setProof(null);
                  setAttempt((value) => value + 1);
                }}
              >
                Retry
              </Button>
            </div>
          </div>
        ) : proof ? (
          <ProofBody proof={proof} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ProofBody({ proof }: { proof: GriProofPackage }) {
  const s = proof.snapshot;
  const raw = numberOrNull(s.raw_score);
  const prev = numberOrNull(s.previous_raw_score);
  const change = numberOrNull(s.change_points);
  const contributionSum = proof.contributions.reduce(
    (sum, row) => sum + Number(row.contribution_points),
    0,
  );
  const scoreResidual = raw === null ? null : raw - contributionSum;
  const changeResidual = numberOrNull(s.change_residual);
  const verified =
    s.verification_status === "verified" &&
    (scoreResidual === null || Math.abs(scoreResidual) <= 0.00001) &&
    (changeResidual === null || Math.abs(changeResidual) <= 0.00001);

  return (
    <div className="px-5 pb-6 sm:px-6">
      <div className="grid gap-3 py-5 sm:grid-cols-2 xl:grid-cols-4">
        <ProofStat
          label="Published score"
          value={s.display_score === null ? "Unavailable" : `${s.display_score}/100`}
        />
        <ProofStat label="Exact raw score" value={fmt(raw, 6)} />
        <ProofStat
          label="Coverage"
          value={`${Math.round((numberOrNull(s.coverage) ?? 0) * 100)}%`}
        />
        <ProofStat
          label="Verification"
          value={verified ? "Reconciled" : (s.verification_status ?? "Unavailable")}
          verified={verified}
        />
      </div>

      <Tabs defaultValue="why" className="w-full">
        <div className="overflow-x-auto pb-1">
          <TabsList className="h-auto min-w-max justify-start">
            <TabsTrigger value="why">Why it moved</TabsTrigger>
            <TabsTrigger value="how">How it is calculated</TabsTrigger>
            <TabsTrigger value="evidence">Evidence</TabsTrigger>
            <TabsTrigger value="integrity">Integrity</TabsTrigger>
            <TabsTrigger value="validation">Validation</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="why" className="space-y-5 pt-3">
          <ChangeEquation previous={prev} change={change} current={raw} residual={changeResidual} />
          <WhyPanel proof={proof} />
        </TabsContent>

        <TabsContent value="how" className="space-y-5 pt-3">
          <ScoreEquation raw={raw} contributionSum={contributionSum} residual={scoreResidual} />
          <FormulaPanel />
          <ContributionLedger contributions={proof.contributions.slice(0, 16)} detailed />
        </TabsContent>

        <TabsContent value="evidence" className="space-y-5 pt-3">
          <div className="rounded-lg border border-border/60 bg-muted/10 p-4 text-sm leading-relaxed text-muted-foreground">
            Each row is one accepted risk observation used in this exact snapshot. The source proves
            the underlying observation; classifier metadata proves which scoring system produced
            severity/confidence; the contribution fields prove how that observation entered the GRI.
          </div>
          <ContributionLedger contributions={proof.contributions} />
        </TabsContent>

        <TabsContent value="integrity" className="space-y-5 pt-3">
          <IntegrityPanel proof={proof} verified={verified} scoreResidual={scoreResidual} />
        </TabsContent>

        <TabsContent value="validation" className="space-y-5 pt-3">
          <ValidationPanel proof={proof} />
        </TabsContent>
      </Tabs>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-5">
        <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">
          GRI is an aggregate intelligence signal, not a market probability. Empirical validation is
          reported separately and never changes the live score.
        </p>
        <a
          href="/docs/gri-architecture"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          Full GRI architecture <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </a>
      </div>
    </div>
  );
}

function ProofStat({
  label,
  value,
  verified = false,
}: {
  label: string;
  value: string;
  verified?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/40 p-4">
      <div className="font-mono text-[10px] uppercase tracking-[0.13em] text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "mt-2 flex items-center gap-2 text-lg font-semibold text-foreground",
          verified && "text-emerald-300",
        )}
      >
        {verified ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : null}
        {value}
      </div>
    </div>
  );
}

function ChangeEquation({
  previous,
  change,
  current,
  residual,
}: {
  previous: number | null;
  change: number | null;
  current: number | null;
  residual: number | null;
}) {
  if (previous === null || change === null || current === null) {
    return (
      <ProofCard icon={FileCheck2} title="Change proof">
        <p className="text-sm leading-relaxed text-muted-foreground">
          This is the methodology baseline or there is no same-version comparison snapshot yet. A
          change claim is intentionally withheld.
        </p>
      </ProofCard>
    );
  }
  return (
    <ProofCard icon={FileCheck2} title="Change proof">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-center">
        <EquationBox label="Previous raw" value={fmt(previous, 6)} />
        <span className="text-center text-muted-foreground">+</span>
        <EquationBox label="Exact change" value={signed(change, 6)} />
        <span className="text-center text-muted-foreground">=</span>
        <EquationBox label="Current raw" value={fmt(current, 6)} />
      </div>
      <p className="mt-3 font-mono text-[11px] text-muted-foreground">
        Change reconciliation residual: {fmt(residual, 12)}
      </p>
    </ProofCard>
  );
}

function ScoreEquation({
  raw,
  contributionSum,
  residual,
}: {
  raw: number | null;
  contributionSum: number;
  residual: number | null;
}) {
  return (
    <ProofCard icon={ShieldCheck} title="Score proof">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
        <EquationBox label="Σ event contribution points" value={fmt(contributionSum, 6)} />
        <span className="text-center text-muted-foreground">=</span>
        <EquationBox label="Published raw GRI" value={fmt(raw, 6)} />
      </div>
      <p className="mt-3 font-mono text-[11px] text-muted-foreground">
        Ledger reconciliation residual: {fmt(residual, 12)}
      </p>
    </ProofCard>
  );
}

function WhyPanel({ proof }: { proof: GriProofPackage }) {
  const why = proof.snapshot.explanation?.why;
  const categories = why?.topCategoryChanges ?? [];
  const events = why?.topEventChanges ?? [];
  const maxCategory = Math.max(
    0.000001,
    ...categories.map((c) => Math.abs(Number(c.deltaPoints ?? 0))),
  );

  if (proof.snapshot.explanation?.baseline) {
    return (
      <ProofCard icon={Fingerprint} title="Why this is the baseline">
        <p className="text-sm leading-relaxed text-muted-foreground">
          No earlier snapshot from the same methodology version is being compared. Geomacro does not
          describe a methodology transition as a real-world risk move.
        </p>
      </ProofCard>
    );
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
      <ProofCard icon={Fingerprint} title="Category attribution">
        <div className="space-y-4">
          {categories.map((c) => {
            const delta = Number(c.deltaPoints ?? 0);
            const width = Math.max(3, (Math.abs(delta) / maxCategory) * 100);
            return (
              <div key={c.category}>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="capitalize text-foreground">{c.category.replace("_", " ")}</span>
                  <Delta value={delta} />
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted/60">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      delta >= 0 ? "bg-rose-400/70" : "bg-emerald-400/70",
                    )}
                    style={{ width: `${width}%` }}
                  />
                </div>
                <div className="mt-1 flex justify-between font-mono text-[10px] text-muted-foreground">
                  <span>{fmt(c.previousContribution, 4)} pts</span>
                  <span>→</span>
                  <span>{fmt(c.currentContribution, 4)} pts</span>
                </div>
              </div>
            );
          })}
        </div>
      </ProofCard>

      <ProofCard icon={FileCheck2} title="Event-by-event change ledger">
        {events.length ? (
          <div className="space-y-3">
            {events.map((e) => (
              <div
                key={e.eventId}
                className="rounded-md border border-border/50 bg-background/30 p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                        {e.kind}
                      </span>
                      <span className="font-mono text-[10px] capitalize text-muted-foreground">
                        {e.category?.replace("_", " ")}
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm font-medium text-foreground">
                      {e.sourceTitle ?? e.eventId}
                    </p>
                  </div>
                  <Delta value={Number(e.deltaPoints ?? 0)} />
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 font-mono text-[10px] text-muted-foreground sm:grid-cols-4">
                  <span>Prev {fmt(e.previousContribution, 4)}</span>
                  <span>Now {fmt(e.currentContribution, 4)}</span>
                  <span>
                    Severity {e.previousSeverity ?? "—"} → {e.currentSeverity ?? "—"}
                  </span>
                  {safeUrl(e.sourceUrl) ? (
                    <a
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                      href={e.sourceUrl as string}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Source <ExternalLink className="h-3 w-3" aria-hidden />
                    </a>
                  ) : (
                    <span>Source unavailable</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No non-zero event changes were recorded for this comparison.
          </p>
        )}
      </ProofCard>
    </div>
  );
}

function FormulaPanel() {
  return (
    <ProofCard icon={Fingerprint} title="Deterministic calculation path">
      <div className="grid gap-3 lg:grid-cols-5">
        {[
          ["1. Event weight", "(confidence / 100) × 2^(-ageHours / 24)"],
          ["2. Source cap", "Each source receives at most 1.0 evidence weight per category"],
          ["3. Category score", "Σ(severity × effective weight) / Σ(effective weight)"],
          ["4. Domain weight", "Four base weights are 25%; active weights are normalized"],
          ["5. GRI", "Σ(normalized category weight × category score)"],
        ].map(([title, formula]) => (
          <div key={title} className="rounded-md border border-border/50 bg-background/30 p-3">
            <p className="text-xs font-semibold text-foreground">{title}</p>
            <p className="mt-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
              {formula}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
        Severity/confidence are model-produced event inputs with provenance. The GRI aggregation
        itself makes no LLM call and has no discretionary manual adjustment.
      </p>
    </ProofCard>
  );
}

function ContributionLedger({
  contributions,
  detailed = false,
}: {
  contributions: GriContributionProof[];
  detailed?: boolean;
}) {
  const rows = useMemo(
    () =>
      [...contributions].sort(
        (a, b) => Math.abs(Number(b.contribution_points)) - Math.abs(Number(a.contribution_points)),
      ),
    [contributions],
  );
  return (
    <ProofCard
      icon={FileCheck2}
      title={
        detailed
          ? "Contribution calculation ledger"
          : `Evidence ledger · ${rows.length} observations`
      }
    >
      <div className="space-y-3">
        {rows.map((row) => (
          <EvidenceRow key={row.event_id} row={row} detailed={detailed} />
        ))}
      </div>
    </ProofCard>
  );
}

function EvidenceRow({ row, detailed }: { row: GriContributionProof; detailed: boolean }) {
  const contribution = Number(row.contribution_points);
  return (
    <details className="group rounded-md border border-border/50 bg-background/30 p-3">
      <summary className="cursor-pointer list-none">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
              <span>{row.category.replace("_", " ")}</span>
              <span>·</span>
              <span>{row.source_domain ?? row.source_name ?? row.source_key}</span>
            </div>
            <p className="mt-1 text-sm font-medium text-foreground">
              {row.source_title ?? row.event_id}
            </p>
          </div>
          <span className="shrink-0 font-mono text-xs font-semibold text-foreground">
            {fmt(contribution, 5)} pts
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] text-muted-foreground">
          <span>Severity {fmt(numberOrNull(row.severity), 2)}</span>
          <span>Confidence {fmt(numberOrNull(row.confidence), 2)}%</span>
          <span>Age {fmt(numberOrNull(row.age_hours), 1)}h</span>
          <span>Global share {pct(numberOrNull(row.global_share))}</span>
        </div>
      </summary>
      <div className="mt-3 grid gap-3 border-t border-border/50 pt-3 lg:grid-cols-2">
        <div>
          {row.summary ? (
            <p className="text-xs leading-relaxed text-muted-foreground">{row.summary}</p>
          ) : null}
          <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <KV label="Observed" value={formatDate(row.observed_at)} />
            <KV label="Published" value={formatDate(row.published_at)} />
            <KV label="Provider" value={row.classification_provider ?? "legacy / unavailable"} />
            <KV label="Model" value={row.classification_model ?? "legacy / unavailable"} />
            <KV label="Classifier" value={row.classification_version ?? "legacy-unversioned"} />
            <KV label="Prompt" value={row.classification_prompt_version ?? "unavailable"} />
          </dl>
          {safeUrl(row.source_url) ? (
            <a
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
              href={row.source_url as string}
              target="_blank"
              rel="noreferrer"
            >
              Open original source <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          ) : null}
        </div>
        <div className="rounded-md border border-border/40 bg-muted/10 p-3 font-mono text-[10px] leading-relaxed text-muted-foreground">
          {detailed ? (
            <>
              <p>confidenceWeight = {fmt(numberOrNull(row.confidence_weight), 8)}</p>
              <p>decayWeight = {fmt(numberOrNull(row.decay_weight), 8)}</p>
              <p>rawWeight = {fmt(numberOrNull(row.raw_weight), 8)}</p>
              <p>effectiveEventWeight = {fmt(numberOrNull(row.effective_event_weight), 8)}</p>
              <p>sourceEffectiveWeight = {fmt(numberOrNull(row.source_effective_weight), 8)}</p>
              <p>categoryEffectiveWeight = {fmt(numberOrNull(row.category_effective_weight), 8)}</p>
              <p>
                normalizedCategoryWeight = {fmt(numberOrNull(row.normalized_category_weight), 8)}
              </p>
              <p>withinCategoryShare = {fmt(numberOrNull(row.within_category_share), 8)}</p>
              <p>globalShare = {fmt(numberOrNull(row.global_share), 8)}</p>
              <p className="mt-2 text-foreground">
                contribution = {fmt(contribution, 8)} GRI points
              </p>
            </>
          ) : (
            <>
              <p>classification input hash</p>
              <p className="mt-1 break-all text-foreground">
                {row.classification_input_hash ?? "legacy / unavailable"}
              </p>
              <p className="mt-3">classification scored at</p>
              <p className="mt-1 text-foreground">{formatDate(row.classification_scored_at)}</p>
            </>
          )}
        </div>
      </div>
    </details>
  );
}

function IntegrityPanel({
  proof,
  verified,
  scoreResidual,
}: {
  proof: GriProofPackage;
  verified: boolean;
  scoreResidual: number | null;
}) {
  const s = proof.snapshot;
  const hashes = [
    ["Methodology hash", s.methodology_hash],
    ["Calculation input hash", s.input_hash],
    ["Evidence/provenance hash", s.evidence_hash],
    ["Calculation hash", s.calculation_hash],
    ["Change-attribution hash", s.change_hash],
    ["Complete proof hash", s.proof_hash],
  ] as const;
  return (
    <div className="grid gap-5 lg:grid-cols-[0.75fr_1.25fr]">
      <ProofCard icon={ShieldCheck} title="Verification state">
        <div
          className={cn(
            "rounded-md border p-4",
            verified
              ? "border-emerald-500/30 bg-emerald-500/10"
              : "border-amber-500/30 bg-amber-500/10",
          )}
        >
          <div className="flex items-center gap-2 font-semibold text-foreground">
            {verified ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-300" />
            ) : (
              <Fingerprint className="h-4 w-4" />
            )}
            {verified ? "Score and change ledgers reconcile" : "Proof requires review"}
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Published proof packages are immutable. Corrections require a new snapshot or a new
            methodology version; existing published rows cannot be edited in place.
          </p>
        </div>
        <dl className="mt-4 space-y-2 text-xs">
          <KV label="Proof version" value={s.proof_version ?? "legacy"} />
          <KV label="Snapshot published" value={formatDate(s.published_at)} />
          <KV label="Score residual" value={fmt(scoreResidual, 12)} />
          <KV label="Change residual" value={fmt(numberOrNull(s.change_residual), 12)} />
        </dl>
      </ProofCard>
      <ProofCard icon={Fingerprint} title="Cryptographic integrity references">
        <div className="space-y-3">
          {hashes.map(([label, value]) => (
            <div key={label}>
              <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                {label}
              </p>
              <p className="mt-1 break-all rounded bg-muted/20 p-2 font-mono text-[10px] leading-relaxed text-foreground">
                {value ?? "not available for this snapshot"}
              </p>
            </div>
          ))}
        </div>
      </ProofCard>
    </div>
  );
}

function ValidationPanel({ proof }: { proof: GriProofPackage }) {
  const run = proof.validationRun;
  if (!run) {
    return (
      <ProofCard icon={FlaskConical} title="Empirical validation">
        <p className="text-sm leading-relaxed text-muted-foreground">
          No validation run has been published for this methodology yet. Geomacro therefore makes no
          historical-performance or predictive claim.
        </p>
      </ProofCard>
    );
  }

  const test = proof.validationMetrics.filter((m) => m.split === "test");
  const completed = run.status === "completed";
  const isLiveOos = run.evidence_mode === "live_oos";
  const modeLabel = isLiveOos ? "Live out-of-sample" : "Retrospective replay";

  return (
    <>
      <ProofCard icon={FlaskConical} title="Validation status">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={cn(
              "rounded-full px-2.5 py-1 font-mono text-[10px] font-semibold uppercase",
              completed ? "bg-emerald-500/10 text-emerald-300" : "bg-amber-500/10 text-amber-300",
            )}
          >
            {run.status.replace("_", " ")}
          </span>
          <span className="rounded-full bg-muted/30 px-2.5 py-1 font-mono text-[10px] uppercase text-muted-foreground">
            {modeLabel}
          </span>
          <span className="font-mono text-[10px] text-muted-foreground">
            {run.validation_version}
          </span>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {!completed
            ? "The minimum sample requirement has not been met. Performance claims are intentionally suppressed until enough observations exist."
            : isLiveOos
              ? "These metrics use observations published after the methodology was fixed, with chronological train/test separation. They measure empirical association, not causality, and do not guarantee future performance."
              : "These metrics come from a retrospective replay. They are calibration evidence only and must never be presented as a historical live prediction or true out-of-sample result."}
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <ProofStat label="Evidence mode" value={isLiveOos ? "Live OOS" : "Replay"} />
          <ProofStat label="Max paired samples" value={String(run.sample_count)} />
          <ProofStat label="Benchmarks" value={String(run.benchmark_count)} />
          <ProofStat
            label="Test share"
            value={
              run.train_fraction === null
                ? "—"
                : `${Math.round((1 - Number(run.train_fraction)) * 100)}%`
            }
          />
        </div>
      </ProofCard>

      {completed && test.length ? (
        <ProofCard
          icon={FlaskConical}
          title={isLiveOos ? "Live out-of-sample metrics" : "Retrospective calibration metrics"}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] text-left text-xs">
              <thead className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                <tr className="border-b border-border/60">
                  <th className="py-2 pr-3">Benchmark</th>
                  <th className="px-3 py-2">Horizon</th>
                  <th className="px-3 py-2">N</th>
                  <th className="px-3 py-2">Pearson</th>
                  <th className="px-3 py-2">Spearman</th>
                  <th className="px-3 py-2">Δ correlation</th>
                  <th className="px-3 py-2">Δ p≈</th>
                  <th className="px-3 py-2">Direction hit</th>
                  <th className="px-3 py-2">False positive</th>
                  <th className="pl-3 py-2">Event-study effect z</th>
                </tr>
              </thead>
              <tbody>
                {test.map((m) => (
                  <tr
                    key={`${m.benchmark_key}-${m.horizon_hours}`}
                    className="border-b border-border/40 text-muted-foreground"
                  >
                    <td className="py-2 pr-3 font-medium text-foreground">{m.benchmark_key}</td>
                    <td className="px-3 py-2">{m.horizon_hours}h</td>
                    <td className="px-3 py-2">{m.sample_count}</td>
                    <td className="px-3 py-2">{fmt(numberOrNull(m.pearson_r), 3)}</td>
                    <td className="px-3 py-2">{fmt(numberOrNull(m.spearman_rho), 3)}</td>
                    <td className="px-3 py-2">{fmt(numberOrNull(m.delta_pearson_r), 3)}</td>
                    <td className="px-3 py-2">{fmt(numberOrNull(m.delta_pearson_p_approx), 3)}</td>
                    <td className="px-3 py-2">{rate(numberOrNull(m.direction_hit_rate))}</td>
                    <td className="px-3 py-2">{rate(numberOrNull(m.false_positive_rate))}</td>
                    <td className="pl-3 py-2">{fmt(numberOrNull(m.event_study_effect_z), 3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
            Approximate p-values apply only to the ΔGRI ↔ future benchmark-change Pearson statistic.
            Event-study effect z compares standardized benchmark movement during high-GRI
            observations with the baseline. Neither metric establishes causality.
          </p>
          <p className="mt-2 font-mono text-[10px] text-muted-foreground">
            Result hash: {run.result_hash ?? "unavailable"}
          </p>
        </ProofCard>
      ) : null}
    </>
  );
}

function ProofCard({
  icon: Icon,
  title,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border/60 bg-card/30 p-4 sm:p-5">
      <div className="mb-4 flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" aria-hidden />
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      {children}
    </section>
  );
}
function EquationBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/50 bg-background/30 p-3 text-center">
      <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-base font-semibold text-foreground">{value}</p>
    </div>
  );
}
function Delta({ value }: { value: number }) {
  const up = value > 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-mono text-xs font-semibold",
        value > 0 ? "text-rose-300" : value < 0 ? "text-emerald-300" : "text-muted-foreground",
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {signed(value, 4)}
    </span>
  );
}
function KV({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 break-words text-foreground">{value}</dd>
    </div>
  );
}
function fmt(value: number | null, digits = 2) {
  return value === null || !Number.isFinite(value) ? "—" : value.toFixed(digits);
}
function signed(value: number, digits = 2) {
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
}
function pct(value: number | null) {
  return value === null ? "—" : `${(value * 100).toFixed(3)}%`;
}
function rate(value: number | null) {
  return value === null ? "n/a" : `${(value * 100).toFixed(1)}%`;
}
function formatDate(value: string | null) {
  if (!value) return "unavailable";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "unavailable";
  return (
    d.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC"
  );
}
function safeUrl(value: string | null) {
  if (!value) return false;
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}
