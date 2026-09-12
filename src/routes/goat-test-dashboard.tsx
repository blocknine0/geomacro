import { createFileRoute } from "@tanstack/react-router";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileArchive,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

const TITLE = "GOAT Testnet3 Live Status · Geomacro";
const DESCRIPTION =
  "Live GOAT Testnet3 acceptance status for Geomacro, including scheduled windows, 250-case repetition gates, matrix status, provider dry-runs and evidence artifacts.";

const REPO = "blocknine0/geomacro";
const WORKFLOW = "goat-acceptance-windows.yml";
const RUNS_URL = `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/runs?branch=main&event=schedule&per_page=30`;
const ARTIFACTS_URL = `https://api.github.com/repos/${REPO}/actions/artifacts?per_page=100`;
const REFRESH_MS = 5 * 60 * 1000;

interface WorkflowRun {
  id: number;
  run_number: number;
  status: string;
  conclusion: string | null;
  created_at: string;
  updated_at: string;
  head_sha: string;
  html_url: string;
}

interface Artifact {
  id: number;
  name: string;
  size_in_bytes: number;
  created_at: string;
  expires_at: string;
  expired: boolean;
  digest?: string | null;
  workflow_run?: { id?: number } | null;
}

interface WorkflowJob {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  html_url?: string;
  started_at?: string | null;
  completed_at?: string | null;
}

interface RunRow extends WorkflowRun {
  artifacts: Artifact[];
}

export const Route = createFileRoute("/goat-test-dashboard")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { name: "robots", content: "noindex,nofollow" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:url", content: "https://geomacro.live/goat-test-dashboard" },
    ],
    links: [{ rel: "canonical", href: "https://geomacro.live/goat-test-dashboard" }],
  }),
  component: GoatTestDashboard,
});

function GoatTestDashboard() {
  const [rows, setRows] = useState<RunRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [jobsByRun, setJobsByRun] = useState<Record<number, WorkflowJob[]>>({});
  const [jobsLoading, setJobsLoading] = useState<Record<number, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = { Accept: "application/vnd.github+json" };
      const [runsResponse, artifactsResponse] = await Promise.all([
        fetch(RUNS_URL, { headers }),
        fetch(ARTIFACTS_URL, { headers }),
      ]);

      if (!runsResponse.ok) {
        throw new Error(`GitHub runs request failed with HTTP ${runsResponse.status}`);
      }
      if (!artifactsResponse.ok) {
        throw new Error(`GitHub artifacts request failed with HTTP ${artifactsResponse.status}`);
      }

      const runsJson = (await runsResponse.json()) as { workflow_runs?: WorkflowRun[] };
      const artifactsJson = (await artifactsResponse.json()) as { artifacts?: Artifact[] };
      const scheduledRuns = (runsJson.workflow_runs ?? []).slice(0, 20);
      const artifacts = artifactsJson.artifacts ?? [];

      const nextRows = scheduledRuns.map((run) => ({
        ...run,
        artifacts: artifacts.filter((artifact) => artifact.workflow_run?.id === run.id),
      }));

      setRows(nextRows);
      setLastUpdated(new Date());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load GOAT acceptance evidence.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const inspectJobs = useCallback(async (runId: number) => {
    if (jobsByRun[runId] || jobsLoading[runId]) return;
    setJobsLoading((current) => ({ ...current, [runId]: true }));
    try {
      const response = await fetch(
        `https://api.github.com/repos/${REPO}/actions/runs/${runId}/jobs?per_page=20`,
        { headers: { Accept: "application/vnd.github+json" } },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = (await response.json()) as { jobs?: WorkflowJob[] };
      setJobsByRun((current) => ({ ...current, [runId]: json.jobs ?? [] }));
    } catch {
      setJobsByRun((current) => ({ ...current, [runId]: [] }));
    } finally {
      setJobsLoading((current) => ({ ...current, [runId]: false }));
    }
  }, [jobsByRun, jobsLoading]);

  const metrics = useMemo(() => {
    const accepted = rows.filter((run) => hasAcceptanceArtifact(run)).length;
    const providers = rows.filter((run) => hasProviderArtifact(run)).length;
    const failed = rows.filter((run) => run.conclusion === "failure").length;
    const inProgress = rows.filter((run) => run.status !== "completed").length;
    return { accepted, providers, failed, inProgress };
  }, [rows]);

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
      <section className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-4xl">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">GOAT Testnet3 · live acceptance evidence</p>
          <div className="mt-4 flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
            </span>
            <span className="text-sm font-medium text-emerald-400">Live status</span>
          </div>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">GOAT acceptance dashboard</h1>
          <p className="mt-5 max-w-3xl text-lg leading-relaxed text-muted-foreground">
            Track scheduled acceptance windows, 250 repeated readiness cases, the full matrix gate, no-payment provider observations and retained GitHub evidence from one place.
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <Button variant="outline" onClick={() => void load()} disabled={loading} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh now
          </Button>
          <p className="text-xs text-muted-foreground">
            {lastUpdated ? `Last updated ${formatIst(lastUpdated.toISOString())}` : "Waiting for first refresh"}
          </p>
          <p className="text-xs text-muted-foreground">Auto-refreshes every 5 minutes</p>
        </div>
      </section>

      <section className="mt-8 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5">
        <div className="flex gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
          <div>
            <h2 className="font-semibold">No-payment safety boundary</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Provider observations create and read a GOAT Testnet3 402 challenge only. The generated payer has no private key. This dashboard cannot dispatch workflows, submit transactions or initiate paid execution.
            </p>
          </div>
        </div>
      </section>

      {error ? (
        <section className="mt-6 rounded-2xl border border-destructive/40 bg-destructive/10 p-5">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div>
              <h2 className="font-semibold">Live data unavailable</h2>
              <p className="mt-1 text-sm text-muted-foreground">{error}</p>
            </div>
          </div>
        </section>
      ) : null}

      <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard icon={CheckCircle2} label="Accepted windows" value={`${metrics.accepted}/20`} detail={`${metrics.accepted * 250}/5,000 repeated cases`} tone="success" />
        <MetricCard icon={Activity} label="Matrix gate" value={metrics.accepted > 0 ? "Passing" : "Pending"} detail="Counted only with acceptance evidence" tone={metrics.accepted > 0 ? "success" : "neutral"} />
        <MetricCard icon={ShieldCheck} label="Provider observations" value={String(metrics.providers)} detail="No-payment Testnet3 evidence" tone="success" />
        <MetricCard icon={XCircle} label="Failed runs" value={String(metrics.failed)} detail="Never counted as accepted" tone={metrics.failed > 0 ? "danger" : "neutral"} />
        <MetricCard icon={Clock3} label="Running now" value={String(metrics.inProgress)} detail="Scheduled workflow in progress" tone={metrics.inProgress > 0 ? "warning" : "neutral"} />
      </section>

      <section className="mt-8 overflow-hidden rounded-2xl border border-border/70 bg-card/40">
        <div className="border-b border-border/70 p-6">
          <h2 className="text-xl font-semibold">Scheduled acceptance windows</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Newest first. A window is accepted only when its retained acceptance artifact exists. Provider evidence is tracked separately and failures are surfaced rather than hidden.
          </p>
        </div>

        {loading && rows.length === 0 ? (
          <div className="p-8 text-sm text-muted-foreground">Loading live GitHub Actions evidence…</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-sm text-muted-foreground">No scheduled GOAT acceptance runs were returned.</div>
        ) : (
          <div className="divide-y divide-border/70">
            {rows.map((run) => (
              <RunCard
                key={run.id}
                run={run}
                jobs={jobsByRun[run.id]}
                jobsLoading={Boolean(jobsLoading[run.id])}
                onInspectJobs={() => void inspectJobs(run.id)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="mt-8 grid gap-5 lg:grid-cols-3">
        <InfoCard title="Acceptance rule">
          A valid window targets exactly 250 repeated readiness cases and the full matrix gate. Failed, cancelled, timed-out or missing evidence is not counted as a pass.
        </InfoCard>
        <InfoCard title="Evidence source">
          Run and artifact metadata are read directly from the public GitHub Actions API for blocknine0/geomacro. Job details are fetched only when you inspect a run, reducing rate-limit pressure.
        </InfoCard>
        <InfoCard title="Program target">
          The current reliability program targets 20 accepted windows × 250 repeated cases = 5,000 repeated cases, with provider observations preserved alongside scheduled acceptance evidence.
        </InfoCard>
      </section>
    </main>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  detail: string;
  tone: "success" | "warning" | "danger" | "neutral";
}) {
  const toneClass =
    tone === "success"
      ? "text-emerald-400"
      : tone === "warning"
        ? "text-amber-400"
        : tone === "danger"
          ? "text-destructive"
          : "text-muted-foreground";
  return (
    <article className="rounded-2xl border border-border/70 bg-card/50 p-5">
      <Icon className={`h-5 w-5 ${toneClass}`} />
      <p className="mt-4 text-xs uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{detail}</p>
    </article>
  );
}

function RunCard({
  run,
  jobs,
  jobsLoading,
  onInspectJobs,
}: {
  run: RunRow;
  jobs?: WorkflowJob[];
  jobsLoading: boolean;
  onInspectJobs: () => void;
}) {
  const acceptanceArtifact = run.artifacts.find((artifact) => artifact.name.startsWith("goat-acceptance-window-"));
  const providerArtifact = run.artifacts.find((artifact) => artifact.name.startsWith("goat-testnet3-provider-dry-run-"));
  const stage = deriveStage(run, Boolean(acceptanceArtifact), Boolean(providerArtifact), jobs);

  return (
    <article className="p-5 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-semibold">Run #{run.run_number}</span>
            <StatusBadge status={run.status} conclusion={run.conclusion} />
            <span className="text-xs text-muted-foreground">ID {run.id}</span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {formatIst(run.created_at)} · SHA <span className="font-mono">{run.head_sha.slice(0, 12)}</span>
          </p>
        </div>
        <a
          href={run.html_url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
        >
          Open GitHub run <ExternalLink className="h-4 w-4" />
        </a>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <StageCard title="250 repeated cases" ok={Boolean(acceptanceArtifact)} detail={acceptanceArtifact ? "Acceptance evidence retained" : "No retained acceptance artifact"} />
        <StageCard title="Full matrix gate" ok={Boolean(acceptanceArtifact)} detail={acceptanceArtifact ? "Required by acceptance workflow" : "Not proven for this run"} />
        <StageCard title="Provider dry run" ok={Boolean(providerArtifact)} detail={providerArtifact ? "No-payment provider evidence retained" : run.status === "completed" ? "No provider artifact retained" : "Waiting for run completion"} />
      </div>

      <div className={`mt-4 rounded-xl border p-4 ${stage.kind === "failure" ? "border-destructive/40 bg-destructive/5" : stage.kind === "warning" ? "border-amber-500/30 bg-amber-500/5" : "border-border/70 bg-background/40"}`}>
        <p className="text-sm font-medium">{stage.title}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{stage.detail}</p>
      </div>

      {run.artifacts.length > 0 ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {run.artifacts.map((artifact) => (
            <ArtifactCard key={artifact.id} artifact={artifact} />
          ))}
        </div>
      ) : null}

      <div className="mt-4">
        <Button variant="outline" size="sm" onClick={onInspectJobs} disabled={jobsLoading} className="gap-2">
          <Activity className="h-4 w-4" />
          {jobsLoading ? "Inspecting jobs…" : jobs ? "Job details loaded" : "Inspect exact stages"}
        </Button>
      </div>

      {jobs ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {jobs.length === 0 ? (
            <p className="text-xs text-muted-foreground">Job details could not be loaded from GitHub.</p>
          ) : (
            jobs.map((job) => (
              <div key={job.id} className="rounded-xl border border-border/70 bg-background/40 p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium">{job.name}</span>
                  <span className="text-xs text-muted-foreground">{job.conclusion ?? job.status}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {job.started_at ? formatIst(job.started_at) : "Not started"}
                  {job.completed_at ? ` · completed ${formatIst(job.completed_at)}` : ""}
                </p>
              </div>
            ))
          )}
        </div>
      ) : null}
    </article>
  );
}

function StageCard({ title, ok, detail }: { title: string; ok: boolean; detail: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-background/40 p-4">
      <div className="flex items-center gap-2">
        {ok ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <Clock3 className="h-4 w-4 text-muted-foreground" />}
        <span className="text-sm font-medium">{title}</span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{detail}</p>
    </div>
  );
}

function ArtifactCard({ artifact }: { artifact: Artifact }) {
  return (
    <div className="rounded-xl border border-border/70 bg-background/40 p-4">
      <div className="flex items-start gap-3">
        <FileArchive className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0">
          <p className="break-all font-mono text-xs font-semibold">{artifact.name}</p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Artifact ID {artifact.id} · {formatBytes(artifact.size_in_bytes)} · expires {formatIst(artifact.expires_at)} · {artifact.expired ? "expired" : "retained"}
          </p>
          {artifact.digest ? <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">{artifact.digest}</p> : null}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status, conclusion }: { status: string; conclusion: string | null }) {
  const value = conclusion ?? status;
  const className =
    value === "success"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
      : value === "failure"
        ? "border-destructive/40 bg-destructive/10 text-destructive"
        : "border-amber-500/30 bg-amber-500/10 text-amber-400";
  return <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${className}`}>{value}</span>;
}

function InfoCard({ title, children }: { title: string; children: string }) {
  return (
    <article className="rounded-2xl border border-border/70 bg-card/50 p-5">
      <h2 className="font-semibold">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{children}</p>
    </article>
  );
}

function hasAcceptanceArtifact(run: RunRow) {
  return run.artifacts.some((artifact) => artifact.name.startsWith("goat-acceptance-window-"));
}

function hasProviderArtifact(run: RunRow) {
  return run.artifacts.some((artifact) => artifact.name.startsWith("goat-testnet3-provider-dry-run-"));
}

function deriveStage(run: RunRow, acceptance: boolean, provider: boolean, jobs?: WorkflowJob[]) {
  if (jobs && jobs.length > 0) {
    const acceptanceJob = jobs.find((job) => job.name === "acceptance-window");
    const providerJob = jobs.find((job) => job.name === "provider-dry-run");
    if (acceptanceJob?.conclusion === "failure") {
      return { kind: "failure" as const, title: "Acceptance stage failed", detail: "The acceptance-window job failed. This run is not counted as accepted." };
    }
    if (providerJob?.conclusion === "failure") {
      return { kind: "failure" as const, title: "Provider stage failed", detail: "The provider-dry-run job failed after acceptance. Provider evidence is not counted for this run." };
    }
    if (acceptanceJob?.conclusion === "success" && providerJob?.conclusion === "success") {
      return { kind: "success" as const, title: "Full scheduled acceptance passed", detail: "Acceptance and no-payment provider stages both completed successfully." };
    }
  }

  if (run.status !== "completed") {
    return { kind: "warning" as const, title: "Run in progress", detail: "The scheduled workflow has not completed yet. No final pass is claimed." };
  }
  if (!acceptance) {
    return { kind: "failure" as const, title: "Acceptance evidence missing", detail: "No retained acceptance artifact exists for this completed run, so the 250-case and matrix gate are not counted as passed." };
  }
  if (!provider) {
    return { kind: run.conclusion === "failure" ? "failure" as const : "warning" as const, title: "Provider evidence missing", detail: "Acceptance evidence exists, but no retained provider dry-run artifact is attached. Inspect exact stages for the provider conclusion." };
  }
  if (run.conclusion === "success") {
    return { kind: "success" as const, title: "Full scheduled acceptance passed", detail: "Acceptance and no-payment provider artifacts are both retained for this successful run." };
  }
  return { kind: "failure" as const, title: "Workflow did not finish cleanly", detail: "Evidence exists, but the workflow conclusion is not success. Inspect exact stages before treating this run as accepted." };
}

function formatIst(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}
