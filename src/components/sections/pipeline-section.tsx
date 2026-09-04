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
    signal: "Raw wire to structured event",
    stages: [
      {
        id: "01",
        name: "Ingest",
        desc: "Pull live headlines across geopolitics, rare earth, macro and crypto.",
        meta: "The Guardian · 4 risk domains",
        latency: "~5s",
      },
      {
        id: "02",
        name: "Normalize",
        desc: "Reshape vendor payloads into one canonical event schema.",
        meta: "Zod schema",
        latency: "<50ms",
      },
      {
        id: "03",
        name: "Dedupe",
        desc: "Rolling djb2 hash plus URL fingerprint to suppress duplicates.",
        meta: "djb2 + URL",
        latency: "<10ms",
      },
    ],
  },
  {
    phase: "P2",
    label: "Intelligence Layer",
    signal: "LLM classification and risk scoring",
    stages: [
      {
        id: "04",
        name: "Prefilter",
        desc: "Drop anything outside the four tracked narrative classes.",
        meta: "Heuristic gate",
        latency: "<5ms",
      },
      {
        id: "05",
        name: "Classify",
        desc: "Route survivors to llama-3.3-70b for category and stage tagging.",
        meta: "Groq · 70B",
        latency: "~1.2s",
      },
      {
        id: "06",
        name: "Score",
        desc: "Assign event severity and confidence; the versioned GRI engine computes contribution deterministically downstream.",
        meta: "0-100 scale",
        latency: "<200ms",
      },
    ],
  },
  {
    phase: "P3",
    label: "Application & Feedback Layer",
    signal: "Optional forecasting and calibration feedback",
    stages: [
      {
        id: "07",
        name: "Predict",
        desc: "Generate a falsifiable forecast as a secondary application of accepted risk intelligence.",
        meta: "Deadline bound",
        latency: "~800ms",
      },
      {
        id: "08",
        name: "Reflect",
        desc: "Evaluate prior calls and market outcomes to support calibration and feedback.",
        meta: "Track record",
        latency: "rolling",
      },
    ],
  },
  {
    phase: "P4",
    label: "Settlement Layer",
    signal: "Onchain attestation and market settlement",
    stages: [
      {
        id: "09",
        name: "Attest",
        desc: "SHA-256 the event payload, sign the digest, post the attestation to Arc.",
        meta: "Arc · SHA-256",
        latency: "~3s",
      },
      {
        id: "10",
        name: "Resolve",
        desc: "Within the secondary prediction-market application layer, the main agent referees the analyst duel and settles the event contract.",
        meta: "Onchain payout",
        latency: "at T+48h",
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
          title="From real-world events to verifiable risk intelligence"
          desc="Ten deterministic stages across four layers turn real-world signals into structured, reproducible risk intelligence. Evidence, confidence and attribution remain traceable, with Arc used as a secondary proof and execution layer."
        />

        <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          <span className="inline-flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]" />
            Live
          </span>
          <span>10 stages</span>
          <span>4 layers</span>
          <span>End-to-end &lt; 10s typical</span>
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
