import { Link } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";

const DOMAINS = [
  ["Geopolitics", "Conflict, policy shifts, interstate tension and external-risk change."],
  ["Macroeconomics", "Growth, inflation, trade, liquidity and sovereign macro pressure."],
  ["Critical minerals", "Supply concentration, dependency, rare-earth and strategic-resource exposure."],
] as const;

const REPEAT_VALUE = [
  "What changed since the last verified state",
  "Why the change matters and where impact can travel",
  "Confidence, freshness and explicit missing coverage",
  "What to watch next in a stable machine-readable shape",
] as const;

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-sm font-medium text-muted-foreground">{children}</p>;
}

export function CommercialHome() {
  return (
    <>
      <section className="mx-auto w-full max-w-7xl px-4 pb-14 pt-12 sm:px-6 sm:pt-18 lg:pb-20 lg:pt-20">
        <div className="grid gap-10 lg:grid-cols-[1.08fr_0.92fr] lg:items-center">
          <div className="max-w-4xl">
            <Label>Global risk intelligence for humans + machines</Label>
            <h1 className="mt-5 text-[clamp(2.7rem,5.6vw,5.4rem)] font-semibold leading-[0.98] tracking-[-0.04em]">
              Know what changed. <span className="text-primary">Why it matters.</span> What to watch next.
            </h1>
            <p className="mt-6 max-w-3xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
              Geomacro turns geopolitical, macroeconomic and critical-mineral developments into concise, decision-ready structured intelligence.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="gap-2">
                <Link to="/intelligence">Open Intelligence <ArrowRight className="h-4 w-4" /></Link>
              </Button>
              <Button asChild size="lg" variant="outline"><Link to="/ask-geomacro">Ask Geomacro</Link></Button>
              <Button asChild size="lg" variant="ghost"><Link to="/data-api">Machine access</Link></Button>
            </div>
            <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
              No raw-data dump. No source hunting. Customers receive governed intelligence with confidence, freshness and clear limits.
            </p>
          </div>

          <article className="rounded-3xl border border-primary/20 bg-card/55 p-6 shadow-sm sm:p-7">
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Structured answer preview</span>
              <span className="rounded-full border border-border/70 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">source-protected</span>
            </div>
            <div className="mt-6 space-y-5">
              <Preview label="Assessment" text="Risk pressure is rising across the selected subject." />
              <Preview label="What changed" text="A newly verified development altered the current risk state." />
              <Preview label="Why it matters" text="The change can propagate through policy, trade, supply or financing channels." />
              <Preview label="Watch next" text="Monitor the next verified state change rather than a raw headline stream." />
            </div>
            <div className="mt-6 grid grid-cols-3 gap-2 border-t border-border/60 pt-4 text-center">
              <Metric label="Confidence" value="Explicit" />
              <Metric label="Freshness" value="Visible" />
              <Metric label="Schema" value="Stable" />
            </div>
          </article>
        </div>
      </section>

      <section className="border-y border-border/60 bg-card/15">
        <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 sm:py-12">
          <Label>Three risk domains</Label>
          <div className="mt-6 grid gap-6 md:grid-cols-3">
            {DOMAINS.map(([title, body]) => (
              <article key={title} className="border-t border-border/70 pt-5">
                <h2 className="text-xl font-semibold">{title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
              </article>
            ))}
          </div>
          <Button asChild variant="outline" className="mt-7"><Link to="/global-risk">Open Risk Indices</Link></Button>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="grid gap-5 md:grid-cols-3">
          <ValueCard eyebrow="For people" title="Decision-ready, not data-heavy" text="Start with the assessment, then see causes, impact, confidence and the next signals worth watching." />
          <ValueCard eyebrow="For machines" title="Stable structured output" text="Use governed JSON, integrity metadata and idempotent delivery instead of scraping a dashboard or parsing prose." />
          <ValueCard eyebrow="Private evidence" title="Raw inputs stay internal" text="Geomacro verifies evidence internally. Product answers do not expose raw source URLs, raw content or private retrieval payloads." />
        </div>
      </section>

      <section className="border-y border-border/60 bg-card/15">
        <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
          <div className="max-w-3xl">
            <Label>How Geomacro works</Label>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Private evidence in. Governed intelligence out.</h2>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <Step n="01" title="Verify privately" text="Ingest, normalize, rights-check and preserve integrity without making raw evidence the product." />
            <Step n="02" title="Structure the risk" text="Convert verified state into separate geopolitical, macroeconomic and critical-mineral context." />
            <Step n="03" title="Deliver the answer" text="Return what changed, why it matters, impact, confidence, freshness and what to watch next." />
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <Label>Built for repeat decisions</Label>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight">Come back for the delta, not another raw feed.</h2>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            Geomacro is designed to make recurring monitoring useful for risk teams, research workflows and autonomous software without manufacturing certainty.
          </p>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2">
          {REPEAT_VALUE.map((item) => (
            <li key={item} className="flex gap-3 rounded-xl border border-border/70 bg-card/35 p-4 text-sm leading-relaxed text-muted-foreground">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="border-y border-primary/20 bg-primary/5">
        <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[1fr_0.9fr] lg:items-center">
          <div>
            <div className="flex items-center gap-2 text-muted-foreground"><LockKeyhole className="h-4 w-4" /><Label>Commercial machine access</Label></div>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">Availability first. Payment only for a deliverable request.</h2>
            <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              Geomacro checks whether the requested intelligence can be safely produced before a payable x402 challenge is issued. Production payment status is reported by the live machine-access surface, not hardcoded marketing copy.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 lg:justify-end">
            <Button asChild size="lg" className="gap-2"><Link to="/data-api">Data & API <ArrowRight className="h-4 w-4" /></Link></Button>
            <Button asChild size="lg" variant="outline"><Link to="/contact">Contact Geomacro</Link></Button>
          </div>
        </div>
      </section>
    </>
  );
}

function Preview({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm leading-relaxed">{text}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm font-semibold">{value}</p>
      <p className="mt-1 text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

function ValueCard({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) {
  return (
    <article className="rounded-2xl border border-border/70 bg-card/35 p-6">
      <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-primary">{eyebrow}</p>
      <h2 className="mt-3 text-xl font-semibold">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{text}</p>
    </article>
  );
}

function Step({ n, title, text }: { n: string; title: string; text: string }) {
  return (
    <article className="rounded-2xl border border-border/70 bg-background/25 p-6">
      <span className="font-mono text-xs text-primary">{n}</span>
      <h3 className="mt-4 text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{text}</p>
    </article>
  );
}
