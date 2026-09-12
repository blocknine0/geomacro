import { createFileRoute } from "@tanstack/react-router";
import {
  Activity,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileArchive,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const TITLE = "GOAT Test Dashboard · Geomacro";
const DESCRIPTION =
  "Live GOAT Testnet3 acceptance evidence for Geomacro, including repeated cases, matrix gate status, provider observations, workflow runs and artifacts.";
const URL = "https://geomacro.live/goat-test-dashboard";
const REPO = "blocknine0/geomacro";
const WORKFLOW = "goat-acceptance-windows.yml";
const RUNS_API = `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/runs?branch=main&event=schedule&per_page=30`;

export const Route = createFileRoute("/goat-test-dashboard")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: URL },
      { property: "og:image", content: "https://geomacro.live/og-image-v2.png" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: URL }],
  }),
  component: GoatTestDashboard,
});

type WorkflowRun = {
  id: number;
  run_number: number;
  event: string;
  status: string;
  conclusion: string | null;
  head_sha: string;
  created_at: string;
  updated_at: string;
  html_url: string;
};

type WorkflowJob = {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  started_at: string | null;
  completed_at: string | null;
  html_url: string;
};

type Artifact = {
  id: number;
  name: string;
  size_in_bytes: number;
  expired: boolean;
  created_at: string;
  expires_at: string;
  archive_download_url: string;
  digest?: string | null;
};

type RunRow = WorkflowRun & {
  jobs: WorkflowJob[];
  jobsError?: boolean;
};

function statusTone(value: string | null) {
  if (value === "success") return "text-emerald-400 border-emerald-400/25 bg-emerald-400/10";
  if (value === "failure" || value === "cancelled" || value === "timed_out") {
    return "text-red-400 border-red-400/25 bg-red-400/10";
  }
  return "text-amber-300 border-amber-300/25 bg-amber-300/10";
}

function formatDate(value: string | null) {
  if (!value) return "—";
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

function jobFor(row: RunRow, name: string) {
  return row.jobs.find((job) => job.name === name);
}

function GoatTestDashboard() {
  const [rows, setRows] = useState<RunRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [artifacts, setArtifacts] = useState<Record<number, Artifact[]>>({});
  const [artifactLoading, setArtifactLoading] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(RUNS_API, {
        headers: { Accept: "application/vnd.github+json" },
      });
      if (!response.ok) throw new Error(`GitHub runs request failed with HTTP ${response.status}`);
      const payload = (await response.json()) as { workflow_runs?: WorkflowRun[] };
      const scheduled = (payload.workflow_runs ?? []).filter((run) => run.event === "schedule");
      const hydrated = await Promise.all(
        scheduled.map(async (run): Promise<RunRow> => {
          try {
            const jobsResponse = await fetch(
              `https://api.github.com/repos/${REPO}/actions/runs/${run.id}/jobs?per_page=20`,
              { headers: { Accept: "application/vnd.github+json" } },
            );
            if (!jobsResponse.ok) throw new Error("jobs unavailable");
            const jobsPayload = (await jobsResponse.json()) as { jobs?: WorkflowJob[] };
            return { ...run, jobs: jobsPayload.jobs ?? [] };
          } catch {
            return { ...run, jobs: [], jobsError: true };
          }
        }),
      );
      setRows(hydrated);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load GOAT acceptance data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const scheduledRows = rows.slice(0, 20);
  const passedAcceptance = useMemo(
    () => scheduledRows.filter((row) => jobFor(row, "acceptance-window")?.conclusion === "success").length,
    [scheduledRows],
  );
  const repeatedCasesPassed = passedAcceptance * 250;
  const providerPasses = useMemo(
    () => scheduledRows.filter((row) => jobFor(row, "provider-dry-run")?.conclusion === "success").length,
    [scheduledRows],
  );
  const failures = useMemo(
    () =>
      scheduledRows.filter((row) => {
        const acceptance = jobFor(row, "acceptance-window");
        const provider = jobFor(row, "provider-dry-run");
        return acceptance?.conclusion === "failure" || provider?.conclusion === "failure";
      }).length,
    [scheduledRows],
  );

  async function loadArtifacts(runId: number) {
    if (artifacts[runId]) return;
    setArtifactLoading(runId);
    try {
      const response = await fetch(
        `https://api.github.com/repos/${REPO}/actions/runs/${runId}/artifacts?per_page=20`,
        { headers: { Accept: "application/vnd.github+json" } },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = (await response.json()) as { artifacts?: Artifact[] };
      setArtifacts((current) => ({ ...current, [runId]: payload.artifacts ?? [] }));
    } catch {
      setArtifacts((current) => ({ ...current, [runId]: [] }));
    } finally {
      setArtifactLoading(null);
    }
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">GOAT Testnet3 · Acceptance Evidence</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">GOAT Test Dashboard</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
            Live evidence from the scheduled Geomacro GOAT acceptance program. Each accepted window targets 250 repeated cases plus the full negative/mainnet-readiness matrix. New scheduled windows also include a no-payment Testnet3 provider observation.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-border/70 px-4 py-2 text-sm transition hover:border-primary/40 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      <div className="mt-8 rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">Safety boundary:</span> provider checks create and read a GOAT Testnet3 402 challenge only. The generated payer has no private key. No transaction is submitted and no commercial revenue is counted.
      </div>

      <section className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Metric label="Accepted windows" value={`${passedAcceptance}/20`} icon={CheckCircle2} />
        <Metric label="Repeated cases passed" value={`${repeatedCasesPassed}/5,000`} icon={Activity} />
        <Metric label="Matrix gate" value={passedAcceptance ? "Passing" : "Pending"} icon={ShieldCheck} />
        <Metric label="Provider observations" value={`${providerPasses}`} icon={FileArchive} />
        <Metric label="Failed windows" value={`${failures}`} icon={XCircle} />
      </section>

      {error ? (
        <div className="mt-8 rounded-2xl border border-red-400/20 bg-red-400/5 p-5 text-sm text-red-300">{error}</div>
      ) : null}

      <section className="mt-8 overflow-hidden rounded-2xl border border-border/70 bg-card/30">
        <div className="border-b border-border/70 px-5 py-4">
          <h2 className="text-lg font-medium">Scheduled acceptance windows</h2>
          <p className="mt-1 text-sm text-muted-foreground">Newest first. Success means the acceptance script completed, recorded exactly 250 repeated cases and passed the matrix gate.</p>
        </div>

        {loading && !rows.length ? (
          <div className="flex items-center gap-2 px-5 py-10 text-sm text-muted-foreground"><RefreshCw className="h-4 w-4 animate-spin" /> Loading GitHub Actions evidence…</div>
        ) : (
          <div className="divide-y divide-border/60">
            {scheduledRows.map((row) => {
              const acceptance = jobFor(row, "acceptance-window");
              const provider = jobFor(row, "provider-dry-run");
              const runArtifacts = artifacts[row.id];
              return (
                <article key={row.id} className="p-5">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm text-foreground">Run #{row.run_number}</span>
                        <span className={`rounded-full border px-2 py-0.5 text-xs ${statusTone(row.conclusion)}`}>{row.conclusion ?? row.status}</span>
                        <span className="text-xs text-muted-foreground">ID {row.id}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                        <span><Clock3 className="mr-1 inline h-3.5 w-3.5" />{formatDate(row.created_at)} IST</span>
                        <span>SHA {row.head_sha.slice(0, 12)}</span>
                      </div>
                    </div>
                    <a href={row.html_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">Open GitHub run <ExternalLink className="h-3.5 w-3.5" /></a>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <StatusCard
                      title="250 repeated cases"
                      state={acceptance?.conclusion}
                      detail={acceptance?.conclusion === "success" ? "250 / 250 passed" : acceptance?.status ?? "No acceptance job"}
                    />
                    <StatusCard
                      title="Full matrix gate"
                      state={acceptance?.conclusion}
                      detail={acceptance?.conclusion === "success" ? "matrix_gate_passed = true" : "Not proven for this window"}
                    />
                    <StatusCard
                      title="Provider dry run"
                      state={provider?.conclusion ?? null}
                      detail={provider?.conclusion === "success" ? "No-payment provider observation passed" : provider ? provider.status : "Not attached to this historical run"}
                    />
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => void loadArtifacts(row.id)}
                      className="inline-flex min-h-9 items-center gap-2 rounded-md border border-border/70 px-3 py-1.5 text-xs transition hover:border-primary/40"
                    >
                      <FileArchive className="h-3.5 w-3.5" />
                      {artifactLoading === row.id ? "Loading artifacts…" : runArtifacts ? "Artifacts loaded" : "Show artifact metadata"}
                    </button>
                    {row.jobsError ? <span className="text-xs text-amber-300">Job metadata unavailable from GitHub API.</span> : null}
                  </div>

                  {runArtifacts ? (
                    <div className="mt-4 grid gap-2">
                      {runArtifacts.length ? runArtifacts.map((artifact) => (
                        <div key={artifact.id} className="rounded-xl border border-border/60 bg-background/30 p-3 text-xs text-muted-foreground">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-mono text-foreground">{artifact.name}</span>
                            <span>{formatBytes(artifact.size_in_bytes)}</span>
                          </div>
                          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                            <span>ID {artifact.id}</span>
                            <span>Created {formatDate(artifact.created_at)}</span>
                            <span>Expires {formatDate(artifact.expires_at)}</span>
                            <span>{artifact.expired ? "Expired" : "Retained"}</span>
                            {artifact.digest ? <span className="break-all">{artifact.digest}</span> : null}
                          </div>
                        </div>
                      )) : <p className="text-xs text-muted-foreground">No artifact metadata returned for this run.</p>}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <InfoCard title="Acceptance rule">A window is counted only when the acceptance job succeeds. The runner is fail-closed: matrix tests execute first, then exactly 250 repeated readiness cases must be present in the report.</InfoCard>
        <InfoCard title="Evidence source">Run, job and artifact metadata come directly from the public GitHub Actions API for blocknine0/geomacro. Artifact contents remain preserved in GitHub Actions under the configured retention policy.</InfoCard>
      </div>
    </main>
  );
}

function Metric({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Activity }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card/40 p-4">
      <Icon className="h-4 w-4 text-primary" />
      <p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function StatusCard({ title, state, detail }: { title: string; state: string | null | undefined; detail: string }) {
  const passed = state === "success";
  const failed = state === "failure" || state === "cancelled" || state === "timed_out";
  const Icon = passed ? CheckCircle2 : failed ? XCircle : Clock3;
  return (
    <div className="rounded-xl border border-border/60 bg-background/30 p-3">
      <div className="flex items-center gap-2 text-sm font-medium"><Icon className={`h-4 w-4 ${passed ? "text-emerald-400" : failed ? "text-red-400" : "text-amber-300"}`} />{title}</div>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{detail}</p>
    </div>
  );
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card/30 p-5">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <div className="mt-2 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </div>
  );
}
