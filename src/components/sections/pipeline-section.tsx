import { useEffect, useState } from "react";
import { SectionHeader } from "@/components/section-ui";
import { supabaseFeed } from "@/lib/supabase-feed";
import { formatSourceName } from "@/lib/sourceNames";

type Stage = {
  id: string;
  name: string;
  desc: string;
  meta: string;
  latency: string;
};

function SourceTags() {
  const [sources, setSources] = useState<{ name: string; count: number }[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabaseFeed
        .from("events")
        .select("source_domain")
        .not("source_domain", "is", null)
        .order("published_at", { ascending: false })
        .limit(1000);
      if (cancelled || error || !data) return;
      const counts = new Map<string, number>();
      for (const row of data as { source_domain: string | null }[]) {
        const name = formatSourceName(row.source_domain);
        if (name === "Unknown source") continue;
        counts.set(name, (counts.get(name) ?? 0) + 1);
      }
      setSources(
        [...counts.entries()]
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (sources.length === 0) return null;
  const shown = expanded ? sources : sources.slice(0, 8);
  const rest = sources.length - 8;

  return (
    <div className="flex flex-wrap gap-1.5">
      {shown.map((s) => (
        <span
          key={s.name}
          className="rounded-full border border-border/60 bg-card/40 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground"
        >
          {s.name}
        </span>
      ))}
      {rest > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="rounded-full border border-primary/40 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-primary transition-colors hover:bg-primary/10"
        >
          {expanded ? "Show less" : `+${rest} more`}
        </button>
      )}
    </div>
  );
}

type StageGroup = {
  phase: string;
  label: string;
  signal: string;
  stages: Stage[];
};

const GROUPS: StageGroup[] = [
  {
    phase: "P1",
    label: "Ingestion Layer",
    signal: "Source evidence to canonical event",
    stages: [
      {
        id: "01",
        name: "Ingest",
        desc: "Collect live source evidence across geopolitical, macro, critical-mineral and separate research streams.",
        meta: "Multi-source evidence intake",
        latency: "~5s",
      },
      {
        id: "02",
        name: "Normalize",
        desc: "Reshape supported source payloads into one canonical event schema with provenance fields preserved.",
        meta: "Canonical schema",
        latency: "<50ms",
      },
      {
        id: "03",
        name: "Dedupe",
        desc: "Apply content and URL fingerprints to suppress obvious duplicate records before downstream scoring.",
        meta: "Content + URL fingerprints",
        latency: "<10ms",
      },
    ],
  },
  {
    phase: "P2",
    label: "Intelligence Layer",
    signal: "Relevance, classification and event risk",
    stages: [
      {
        id: "04",
        name: "Prefilter",
        desc: "Apply relevance gates so unsupported or low-value material does not enter the accepted intelligence set.",
        meta: "Relevance gate",
        latency: "<5ms",
      },
      {
        id: "05",
        name: "Classify",
        desc: "Route accepted evidence through the versioned classification layer for category, structure and provenance-aware metadata.",
        meta: "Versioned classifier",
        latency: "~1.2s",
      },
      {
        id: "06",
        name: "Score",
        desc: "Assign event severity and confidence. The separate versioned GRI engine then computes eligible contribution deterministically.",
        meta: "Event risk · 0–100",
        latency: "<200ms",
      },
    ],
  },
  {
    phase: "P3",
    label: "Application & Feedback Layer",
    signal: "Optional forecasting and calibration research",
    stages: [
      {
        id: "07",
        name: "Predict",
        desc: "Generate falsifiable forecasts only as a secondary application of accepted risk intelligence, separate from the GRI calculation.",
        meta: "Secondary application",
        latency: "~800ms",
      },
      {
        id: "08",
        name: "Reflect",
        desc: "Evaluate prior calls and secondary market outcomes as calibration feedback without redefining the primary intelligence product.",
        meta: "Calibration feedback",
        latency: "rolling",
      },
    ],
  },
  {
    phase: "P4",
    label: "Technical Proof Layer",
    signal: "Optional Arc attestation and testnet settlement",
    stages: [
      {
        id: "09",
        name: "Attest",
        desc: "Hash selected payloads and preserve an optional Arc Testnet attestation path as technical proof.",
        meta: "Arc Testnet · SHA-256",
        latency: "~3s",
      },
      {
        id: "10",
        name: "Resolve",
        desc: "Within the secondary prediction-market application, resolve and settle testnet event contracts after the defined lifecycle completes.",
        meta: "Secondary testnet layer",
        latency: "lifecycle dependent",
      },
    ],
  },
];

export function PipelineSection() {
  return (
    <section className="border-y border-border/60 bg-card/20">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 md:py-24">
        <SectionHeader
          as="h1"
          eyebrow="Data Pipeline"
          title="From source evidence to verifiable risk intelligence"
          desc="The pipeline combines evidence intake, structured classification and event-level risk scoring. The current public GRI v1.2 calculation uses three scoring domains only: geopolitics, macro and rare-earth / critical-mineral risk. Other research and testnet streams remain separate."
        />

        <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          <span className="inline-flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]" />
            Live technical view
          </span>
          <span>10 stages</span>
          <span>4 implementation layers</span>
          <span>GRI scoring · 3 domains</span>
        </div>

        <div className="mt-6 space-y-px overflow-hidden rounded-2xl border border-border/60 bg-border/60">
          {GROUPS.map((group) => (
            <div key={group.phase} className="bg-background">
              <div className="flex flex-col gap-1 border-b border-border/60 bg-card/40 px-5 py-4 sm:flex-row sm:items-baseline sm:justify-between sm:px-6">
                <div className="flex items-baseline gap-3">
                  <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-primary">
                    {group.phase}
                  </span>
                  <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-foreground">
                    {group.label}
                  </h3>
                </div>
                <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  {group.signal}
                </div>
              </div>
              <ol
                className={`grid grid-cols-1 gap-px bg-border/60 sm:grid-cols-2 ${group.stages.length < 3 ? "lg:grid-cols-2" : "lg:grid-cols-3"}`}
              >
                {group.stages.map((s) => (
                  <li
                    key={s.id}
                    className="group relative flex flex-col gap-3 bg-background p-5 transition-colors hover:bg-card/40 sm:p-6"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[11px] tracking-[0.18em] text-primary">
                        {s.id}
                      </span>
                      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                        {s.latency}
                      </span>
                    </div>
                    <div>
                      <div className="text-base font-medium text-foreground">{s.name}</div>
                      <div className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        {s.desc}
                      </div>
                      {s.name === "Ingest" && (
                        <div className="mt-3">
                          <SourceTags />
                        </div>
                      )}
                    </div>
                    <div className="mt-auto flex items-center gap-2 border-t border-border/40 pt-3">
                      <span className="size-1 rounded-full bg-primary/70" />
                      <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                        {s.meta}
                      </span>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
