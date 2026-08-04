import { SectionHeader } from "@/components/section-ui";
import { ROADMAP, type RoadmapStatus } from "@/lib/roadmap";

const STATUS_META: Record<RoadmapStatus, { label: string; dot: string; text: string; ring: string }> = {
  shipped: {
    label: "Shipped",
    dot: "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]",
    text: "text-emerald-300",
    ring: "border-emerald-500/30",
  },
  "in-progress": {
    label: "In progress",
    dot: "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.7)] animate-pulse",
    text: "text-amber-300",
    ring: "border-amber-500/30",
  },
  next: {
    label: "Next",
    dot: "bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.6)]",
    text: "text-sky-300",
    ring: "border-sky-500/30",
  },
  research: {
    label: "Research",
    dot: "bg-muted-foreground/60",
    text: "text-muted-foreground",
    ring: "border-border/60",
  },
};

export function RoadmapSection() {
  const shipped = ROADMAP.filter((m) => m.status === "shipped").length;
  const inProgress = ROADMAP.filter((m) => m.status === "in-progress").length;
  const next = ROADMAP.filter((m) => m.status === "next").length;

  return (
    <section className="mx-auto max-w-7xl px-4 pb-20 pt-12 sm:px-6 sm:pt-16 md:pb-32 md:pt-24">
      <SectionHeader
        eyebrow="Protocol Roadmap"
        title="Versioned milestones from ingestion to mainnet settlement"
        desc="A reproducible build path. Every milestone ships with verifiable artifacts. No private roadmap, no surprise scope, no marketing-only phases."
      />

      <p className="mt-3 text-xs italic text-muted-foreground">
        Timelines for v0.7 onward depend on Circle's Arc mainnet launch.
      </p>

      <div className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border/60 bg-border/60 sm:grid-cols-4">
        {[
          { k: "Total", v: ROADMAP.length.toString().padStart(2, "0") },
          { k: "Shipped", v: shipped.toString().padStart(2, "0") },
          { k: "In progress", v: inProgress.toString().padStart(2, "0") },
          { k: "Queued", v: next.toString().padStart(2, "0") },
        ].map((s) => (
          <div key={s.k} className="bg-background px-5 py-4">
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{s.k}</div>
            <div className="mt-1 font-mono text-2xl text-foreground">{s.v}</div>
          </div>
        ))}
      </div>

      <ol className="relative mt-10 space-y-3 before:absolute before:left-3 before:top-2 before:bottom-2 before:w-px before:bg-border/60 sm:before:left-4">
        {ROADMAP.map((m) => {
          const meta = STATUS_META[m.status];
          return (
            <li key={m.version} className="relative pl-10 sm:pl-12">
              <span
                className={`absolute left-[7px] top-5 size-2.5 rounded-full ring-4 ring-background sm:left-[11px] ${meta.dot}`}
                aria-hidden
              />
              <article className={`group rounded-xl border ${meta.ring} bg-card/40 p-5 transition-colors hover:bg-card/60 sm:p-6`}>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <span className="font-mono text-xs tracking-[0.16em] text-primary">{m.version}</span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{m.quarter}</span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{m.layer} layer</span>
                  <span className={`ml-auto inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] ${meta.text}`}>
                    <span className={`size-1.5 rounded-full ${meta.dot}`} aria-hidden />
                    {meta.label}
                  </span>
                </div>
                <h3 className="mt-3 text-base font-medium text-foreground sm:text-lg">{m.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{m.scope}</p>
                <div className="mt-4 flex flex-wrap gap-2 border-t border-border/40 pt-3">
                  {m.artifacts.map((a) => (
                    <span
                      key={a}
                      className="rounded-md border border-border/60 bg-background px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground"
                    >
                      {a}
                    </span>
                  ))}
                </div>
              </article>
            </li>
          );
        })}
      </ol>
    </section>
  );
}