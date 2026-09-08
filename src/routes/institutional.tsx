import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Bot,
  Building2,
  CheckCircle2,
  Landmark,
  Route as RouteIcon,
  ShieldCheck,
  Workflow,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RiskBadge, RiskScore, RiskTrend } from "@/components/foundation/risk";
import { RiskChart } from "@/components/home/risk-chart";
import { prettyCategory, useIntelligence } from "@/lib/use-intelligence";
import { useGlobalRisk } from "@/lib/use-global-risk";

const TITLE = "Institutional Risk Intelligence · Geomacro";
const DESCRIPTION =
  "Geopolitical and macro risk intelligence for treasury, payments, strategy and supply-chain teams, with controlled Private Pilot access to Risk Gate and API delivery.";

const USE_CASES = [
  {
    icon: Landmark,
    title: "Treasury and payments",
    body: "Check country or corridor risk before releasing a cross-border payment, changing limits or escalating an approval workflow.",
  },
  {
    icon: Building2,
    title: "Risk and strategy",
    body: "Track current risk, evidence, confidence and the exact drivers behind a change instead of relying on a headline score.",
  },
  {
    icon: RouteIcon,
    title: "Supply chain and commodities",
    body: "Use geopolitical, macro and critical-mineral risk to support sourcing, exposure and operational monitoring decisions.",
  },
  {
    icon: Bot,
    title: "Software and agent platforms",
    body: "Add signed external risk context to automated financial workflows before they act.",
  },
] as const;

export const Route = createFileRoute("/institutional")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://geomacro.live/institutional" },
      { property: "og:image", content: "https://geomacro.live/og-signal-card-v2.png" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://geomacro.live/institutional" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: TITLE,
          url: "https://geomacro.live/institutional",
          description: DESCRIPTION,
          isPartOf: { "@type": "WebSite", name: "Geomacro", url: "https://geomacro.live/" },
        }),
      },
    ],
  }),
  component: InstitutionalPage,
});

function InstitutionalPage() {
  const risk = useGlobalRisk();
  const intel = useIntelligence();
  const series = risk.data?.series["7D"]?.buckets ?? null;
  const topEvents = intel.data?.topRisks.slice(0, 6) ?? [];
  const tableEvents = intel.data?.today.slice(0, 10) ?? [];

  return (
    <main>
      <section className="border-b border-border/60">
        <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 md:py-18">
          <Badge variant="outline" className="font-mono text-[10px] uppercase tracking-[0.14em]">
            FOUNDING PILOT · EARLY ACCESS
          </Badge>
          <h1 className="mt-5 max-w-4xl text-4xl font-semibold tracking-tight sm:text-5xl md:text-6xl">
            Explainable geopolitical and macro risk intelligence for operational decisions.
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg">
            Geomacro gives research, risk and treasury teams one place to see what changed, how risk moved, what evidence supports the change and where confidence is limited.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg" className="gap-2">
              <Link to="/contact">Discuss a founding pilot <ArrowRight className="h-4 w-4" /></Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/risk-gate">See Risk Gate</Link>
            </Button>
            <Button asChild size="lg" variant="ghost">
              <Link to="/intelligence">Explore public intelligence</Link>
            </Button>
          </div>
          <p className="mt-5 max-w-3xl text-xs leading-relaxed text-muted-foreground">
            Geomacro is early-stage. Risk API and Risk Gate are still Private Pilot. There is no general institutional SLA or automated enterprise onboarding today.
          </p>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="max-w-3xl">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Live workspace preview</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">The same current intelligence, presented for professional review.</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            This preview uses the same public Geomacro data as the rest of the product. It does not create special institutional-only scores for display.
          </p>
        </div>

        <div className="mt-8 grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(300px,0.7fr)]">
          <div className="rounded-2xl border border-border/70 bg-card/40 p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Global Risk Index</p>
                {risk.data ? <RiskScore score={risk.data.score} size="lg" className="mt-3" /> : <p className="mt-3 text-sm text-muted-foreground">Verified snapshot unavailable.</p>}
              </div>
              <Button asChild variant="outline" size="sm"><Link to="/global-risk">Verify GRI</Link></Button>
            </div>

            {risk.data && series && series.length > 1 ? (
              <RiskChart buckets={series} label="Verified GRI, last 7 days" height={190} className="mt-6" />
            ) : (
              <div className="mt-6 rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
                The historical chart appears when enough current-methodology snapshots are available.
              </div>
            )}

            {risk.data ? (
              <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Metric label="Evidence" value={String(risk.data.eventCount)} />
                <Metric label="Stories" value={String(risk.data.independentStoryCount)} />
                <Metric label="Sources" value={risk.data.sourceCount === null ? "—" : String(risk.data.sourceCount)} />
                <Metric label="Coverage" value={`${Math.round(risk.data.coverage * 100)}%`} />
              </dl>
            ) : null}
          </div>

          <div className="rounded-2xl border border-border/70 bg-card/40 p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Top current risks</p>
              <Link to="/intelligence" className="text-xs text-primary hover:underline">All intelligence</Link>
            </div>
            {topEvents.length ? (
              <ol className="mt-4 space-y-3">
                {topEvents.map((event, index) => (
                  <li key={event.id} className="border-b border-border/50 pb-3 last:border-0 last:pb-0">
                    <div className="flex items-start gap-3">
                      <span className="font-mono text-[10px] text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
                      <div className="min-w-0 flex-1">
                        <Link to="/event/$eventId" params={{ eventId: event.id }} className="line-clamp-2 text-sm font-medium hover:text-primary">
                          {event.title}
                        </Link>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          {event.severity !== null ? <RiskBadge score={event.severity} showScore /> : null}
                          {event.delta !== null && event.delta !== 0 ? <RiskTrend delta={Math.round(event.delta)} /> : null}
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">Current scored events are unavailable.</p>
            )}
          </div>
        </div>
      </section>

      <section className="border-y border-border/60 bg-card/20">
        <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Professional risk table</p>
              <h2 className="mt-2 text-2xl font-semibold">Current scored events in one review table.</h2>
            </div>
            <p className="max-w-xl text-sm text-muted-foreground">Only recorded values are shown. Missing movement or severity stays unavailable rather than being estimated.</p>
          </div>

          <div className="mt-7 overflow-x-auto rounded-2xl border border-border/70 bg-background/30">
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <thead className="bg-card/60 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Event</th>
                  <th className="px-4 py-3">Domain</th>
                  <th className="px-4 py-3">Risk</th>
                  <th className="px-4 py-3">Movement</th>
                  <th className="px-4 py-3">Observed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {tableEvents.length ? tableEvents.map((event) => (
                  <tr key={event.id} className="align-top">
                    <td className="max-w-[420px] px-4 py-4">
                      <Link to="/event/$eventId" params={{ eventId: event.id }} className="font-medium hover:text-primary">{event.title}</Link>
                    </td>
                    <td className="px-4 py-4 text-muted-foreground">{event.category ? prettyCategory(event.category) : "—"}</td>
                    <td className="px-4 py-4">{event.severity !== null ? <RiskBadge score={event.severity} showScore /> : "—"}</td>
                    <td className="px-4 py-4">{event.delta !== null && event.delta !== 0 ? <RiskTrend delta={Math.round(event.delta)} /> : <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-4 py-4 text-muted-foreground">{formatDate(event.publishedAt ?? event.createdAt)}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Current risk rows unavailable.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Applied workflows</p>
        <h2 className="mt-2 max-w-3xl text-3xl font-semibold tracking-tight">Different teams, the same evidence trail.</h2>
        <div className="mt-8 grid gap-5 md:grid-cols-2">
          {USE_CASES.map(({ icon: Icon, title, body }) => (
            <article key={title} className="rounded-2xl border border-border/70 bg-card/40 p-6">
              <Icon className="h-5 w-5 text-primary" />
              <h3 className="mt-4 text-lg font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-border/60 bg-card/20">
        <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[0.85fr_1.15fr]">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Private Pilot workflow</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">Check risk before the action moves forward.</h2>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              Risk Gate combines a verified country or corridor Risk Object with the customer's own policy. Geomacro returns a recommendation; the customer controls execution.
            </p>
            <Button asChild className="mt-6 gap-2"><Link to="/risk-gate">Review Risk Gate <ArrowRight className="h-4 w-4" /></Link></Button>
          </div>
          <ol className="space-y-3">
            {[
              "The customer or agent submits an action for review.",
              "Geomacro verifies the current country or corridor risk context.",
              "Evidence, confidence, freshness and issuer integrity are checked.",
              "The customer's policy is applied.",
              "Risk Gate returns CONTINUE, REDUCE_LIMIT, REQUIRE_APPROVAL, PAUSE or REROUTE.",
              "Any execution after that remains under the customer's control.",
            ].map((step, index) => (
              <li key={step} className="flex gap-3 rounded-xl border border-border/70 bg-background/30 p-4 text-sm">
                <span className="font-mono text-[10px] text-primary">{String(index + 1).padStart(2, "0")}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="grid gap-5 lg:grid-cols-3">
          <TrustCard icon={ShieldCheck} title="Evidence stays visible" text="Scores are shown with evidence, confidence, attribution, methodology and integrity details instead of being presented as a black box." />
          <TrustCard icon={Workflow} title="For people and software" text="Signed Risk Objects and Private Pilot APIs can be reviewed by analysts or consumed by software systems." />
          <TrustCard icon={CheckCircle2} title="Limits are stated plainly" text="Private Pilot, planned and Technical Proof capabilities are labelled separately. External audit and production SLA are not claimed." />
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 pb-16 sm:px-6">
        <div className="rounded-2xl border border-primary/25 bg-primary/5 p-7 sm:p-9">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Founding partners</p>
          <div className="mt-3 flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div>
              <h2 className="text-2xl font-semibold">Bring one real country, corridor or treasury workflow.</h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Early pilots stay narrow so the methodology, controls and business value can be tested before anything is packaged for wider enterprise use.
              </p>
            </div>
            <Button asChild size="lg" className="shrink-0"><Link to="/contact">Discuss a pilot</Link></Button>
          </div>
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/30 p-3">
      <dt className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-mono text-sm text-foreground">{value}</dd>
    </div>
  );
}

function TrustCard({ icon: Icon, title, text }: { icon: typeof ShieldCheck; title: string; text: string }) {
  return (
    <article className="rounded-2xl border border-border/70 bg-card/40 p-6">
      <Icon className="h-5 w-5 text-primary" />
      <h3 className="mt-4 text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{text}</p>
    </article>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" }).format(date);
}
