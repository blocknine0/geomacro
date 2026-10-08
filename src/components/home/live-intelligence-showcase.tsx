import { Link } from "@tanstack/react-router";
import { ArrowRight, Bot, CalendarDays, Clock3, Mail, Radio, ShieldCheck, Zap } from "lucide-react";
import { useIntelligence } from "@/lib/use-intelligence";
import { selectHomepageShowcase } from "@/lib/homepage-intelligence-showcase";

const LABELS: Record<string, string> = {
  geopolitics: "Geopolitical",
  macro: "Macro & FX",
  rare_earth: "Critical minerals",
};
const WATCH: Record<string, string> = {
  geopolitics: "Policy decisions · Conflict developments · Cross-border restrictions",
  macro: "Central-bank releases · Currency pressure · Economic indicators",
  rare_earth: "Export controls · Processing capacity · Supply concentration",
};
const ANNUAL_MAIL =
  "mailto:contact@geomacro.live?subject=" +
  encodeURIComponent("Geomacro annual intelligence and enterprise access");

function dated(value: string): string {
  return new Date(value).toLocaleString("en-GB", {
    timeZone: "UTC", day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }) + " UTC";
}

function CommercialOptions() {
  return (
    <div className="mt-5 border-t border-border/60 pt-5">
      <h3 className="text-base font-semibold">Access intelligence like this</h3>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        Structured Geomacro intelligence for businesses, developers and AI agents.
      </p>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Link to="/pricing" className="group rounded-xl border border-primary/30 bg-primary/8 p-3 transition hover:border-primary/60">
          <span className="flex items-center gap-2 text-xs font-semibold"><Zap className="h-3.5 w-3.5 text-primary" /> Pay per call</span>
          <span className="mt-2 block text-base font-semibold">0.05 USDC <span className="text-xs font-normal text-muted-foreground">/ successful call</span></span>
          <span className="mt-1 inline-flex items-center gap-1 text-xs text-primary">Explore x402 access <ArrowRight className="h-3 w-3" /></span>
        </Link>
        <a href="mailto:contact@geomacro.live?subject=Geomacro%20monthly%20intelligence%20access"
          className="group rounded-xl border border-border/70 bg-background/30 p-3 transition hover:border-primary/50">
          <span className="flex items-center gap-2 text-xs font-semibold"><CalendarDays className="h-3.5 w-3.5 text-primary" /> Monthly access</span>
          <span className="mt-2 block text-sm font-medium">Request a recurring plan</span>
          <span className="mt-1 inline-flex items-center gap-1 text-xs text-primary">Discuss monthly access <Mail className="h-3 w-3" /></span>
        </a>
      </div>
      <a href={ANNUAL_MAIL}
        className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-background/30 p-3 transition hover:border-primary/50">
        <span>
          <span className="flex items-center gap-2 text-xs font-semibold"><Mail className="h-3.5 w-3.5 text-primary" /> Yearly & enterprise</span>
          <span className="mt-1 block text-xs text-muted-foreground">Annual contracts and custom integrations · Contact sales by email</span>
        </span>
        <ArrowRight className="h-4 w-4 shrink-0 text-primary" />
      </a>
      <p className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
        <Bot className="h-3.5 w-3.5" /> API & agent integration: <Link to="/data-api" className="underline underline-offset-2 hover:text-primary">view capabilities</Link>
      </p>
    </div>
  );
}

export function LiveIntelligenceShowcase() {
  const intelligence = useIntelligence(null, 5 * 60_000);
  const winner = intelligence.data
    ? selectHomepageShowcase(intelligence.data.all)
    : null;
  const event = winner?.event;
  const story = event?.title.replace(/^Geomacro finds\s+/u, "") ?? null;
  const category = event?.category ?? "";
  const summary = event?.summary?.trim() ?? "";

  return (
    <div className="relative mx-auto w-full max-w-xl lg:mx-0 lg:max-w-none">
      <div className="absolute -inset-6 rounded-[2.25rem] bg-primary/6 blur-3xl" />
      <div className="relative overflow-hidden rounded-[1.75rem] border border-border/70 bg-card/70 p-5 shadow-2xl shadow-black/20 backdrop-blur sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
            <Radio className="h-3.5 w-3.5" aria-hidden /> Geomacro Finds
          </p>
          <span className="rounded-full border border-border/70 bg-background/40 px-2.5 py-1 font-mono text-[10px] text-muted-foreground">
            {winner?.isCurrent ? "Top verified · Last 24h" : "Latest verified historical"}
          </span>
        </div>

        {event && winner ? (
          <article className="mt-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              {LABELS[category] ?? "Verified intelligence"} · Event severity {event.severity}/100
            </p>
            <h2 className="mt-2 text-xl font-semibold leading-snug tracking-tight sm:text-2xl">
              {story}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              <Clock3 className="h-3.5 w-3.5" aria-hidden />
              <time dateTime={winner.observedAt}>Published / observed: {dated(winner.observedAt)}</time>
            </div>
            {!winner.isCurrent && (
              <p className="mt-2 rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs text-muted-foreground">
                Last verified story retained. Its earlier event assessment is not a claim of current risk conditions.
              </p>
            )}

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <div className="rounded-xl border border-border/60 bg-background/30 p-3">
                <p className="text-[11px] text-muted-foreground">Before</p>
                <p className="mt-1 text-xs leading-5">
                  Earlier comparable state not provided in the public event projection.
                </p>
              </div>
              <div className="rounded-xl border border-border/60 bg-background/30 p-3">
                <p className="text-[11px] text-muted-foreground">Now · Verified event</p>
                <p className="mt-1 text-sm font-semibold">Severity {event.severity}/100</p>
                {event.delta !== null && Number.isFinite(event.delta) && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Recorded movement: {event.delta > 0 ? "+" : ""}{event.delta}
                  </p>
                )}
              </div>
            </div>
            <div className="mt-3 space-y-3 text-xs leading-5">
              <div>
                <h3 className="font-semibold text-foreground">Why · Derived context</h3>
                <p className="mt-1 text-muted-foreground">
                  {summary && summary.toLowerCase() !== story?.toLowerCase() ? summary : "Specific causal drivers have not been independently established in this public preview."}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  A development summary does not by itself establish causation.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Potential next impact</h3>
                <p className="mt-1 text-muted-foreground">
                  A case-specific forward-impact assessment has not been verified in this public snapshot.
                  Use Geomacro intelligence for a conditional analysis when supported by evidence.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Watch next · Monitoring lens</h3>
                <p className="mt-1 text-muted-foreground">{WATCH[category] ?? "Subsequent verified developments"}</p>
              </div>
            </div>
            <p className="mt-4 flex items-center gap-2 text-[11px] text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-primary" />
              Derived public intelligence only · No raw source material · No invented confidence
            </p>
          </article>
        ) : (
          <div className="mt-4 rounded-xl border border-dashed border-border/70 bg-background/25 p-5">
            <p className="text-sm font-semibold">
              {intelligence.status === "loading" ? "Loading verified Geomacro intelligence…" : "Verified showcase temporarily unavailable"}
            </p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              No static story, fabricated risk score or raw news fallback is displayed.
              Explore the canonical Intelligence product for currently available records.
            </p>
          </div>
        )}

        <CommercialOptions />
      </div>
    </div>
  );
}
