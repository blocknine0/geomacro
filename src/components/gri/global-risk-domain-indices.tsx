import { RiskBadge, RiskTrend } from "@/components/foundation/risk";
import { useGlobalRisk } from "@/lib/use-global-risk";

export const DOMAIN_INDEX_SPECS = [
  { key: "geopolitics", name: "Geopolitical Risk Index" },
  { key: "macro", name: "Macroeconomic Risk Index" },
  { key: "rare_earth", name: "Critical Minerals Risk Index" },
] as const;

export function GlobalRiskDomainIndices() {
  const risk = useGlobalRisk();
  const data = risk.data;

  return (
    <section
      className="mx-auto w-full max-w-7xl px-4 pt-10 sm:px-6 md:pt-14"
      aria-labelledby="global-risk-domain-indices-heading"
    >
      <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">
        Verified domain indices
      </p>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2
            id="global-risk-domain-indices-heading"
            className="text-2xl font-semibold tracking-tight sm:text-3xl"
          >
            Three risk indices, always visible
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">
            A newer verified domain result replaces its previous reading automatically. If no newer verified result exists, Geomacro keeps showing that domain&apos;s last verified reading. The combined GRI below is a headline aggregate, not a replacement for these three indices.
          </p>
        </div>
      </div>

      <div className="mt-7 grid gap-4 lg:grid-cols-3">
        {DOMAIN_INDEX_SPECS.map((spec) => {
          const domain = data?.domainIndices[spec.key] ?? null;
          const statusLabel = domain?.readingStatus === "current" ? "Current verified" : "Last verified";
          return (
            <article
              key={spec.key}
              className="rounded-2xl border border-border/70 bg-card/45 p-5 sm:p-6"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    {spec.name}
                  </p>
                  <div className="mt-3 flex flex-wrap items-end gap-3">
                    <span className="text-5xl font-semibold tabular-nums text-foreground">
                      {domain ? domain.score : "—"}
                      {domain ? (
                        <span className="ml-1 text-sm font-normal text-muted-foreground">/100</span>
                      ) : null}
                    </span>
                    {domain?.changePoints !== null && domain?.changePoints !== undefined ? (
                      <RiskTrend delta={domain.changePoints} />
                    ) : null}
                  </div>
                </div>
                <span className="rounded-full border border-primary/30 bg-primary/5 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-primary">
                  {domain ? statusLabel : "Loading verified history"}
                </span>
              </div>

              {domain ? <div className="mt-3"><RiskBadge score={domain.score} /></div> : null}

              <dl className="mt-6 grid grid-cols-2 gap-4">
                <Metric label="Exact raw" value={domain ? fmt(domain.rawScore, 6) : "—"} />
                <Metric
                  label="Previous"
                  value={domain?.previousScore === null || domain?.previousScore === undefined ? "—" : fmt(domain.previousScore, 1)}
                />
                <Metric label="Evidence" value={domain ? String(domain.eventCount) : "—"} />
                <Metric label="Stories" value={domain ? String(domain.independentStoryCount) : "—"} />
                <Metric label="Sources" value={domain ? String(domain.sourceCount) : "—"} />
                <Metric
                  label="Confidence"
                  value={domain?.confidence === null || domain?.confidence === undefined ? "—" : `${Math.round(domain.confidence)}%`}
                />
              </dl>

              {domain ? (
                <p className="mt-5 border-t border-border/60 pt-4 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  {statusLabel} · {formatDate(domain.readingAsOf)}
                </p>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm font-medium text-foreground">{value}</dd>
    </div>
  );
}

function fmt(value: number, digits = 2) {
  return Number.isFinite(value) ? value.toFixed(digits) : "—";
}

function formatDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unknown verified time";
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
