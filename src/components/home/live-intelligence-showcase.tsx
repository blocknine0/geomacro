import { Link } from "@tanstack/react-router";
import { ArrowRight, CalendarDays, Clock3, Mail, Radio, Zap } from "lucide-react";
import { useIntelligence } from "@/lib/use-intelligence";
import { selectHomepageShowcase } from "@/lib/homepage-intelligence-showcase";

const DOMAINS: Record<string, string> = {
  geopolitics: "Geopolitical",
  macro: "Macro & FX",
  rare_earth: "Critical minerals",
};

// Monitoring themes, not claims of an event-specific prediction.
const FOCUS: Record<string, string[]> = {
  geopolitics: ["Policy responses", "Regional stability", "Cross-border impact"],
  macro: ["Monetary policy", "FX pressure", "Economic outlook"],
  rare_earth: ["Export policies", "Supply capacity", "Procurement risk"],
};

const BUSINESS_EMAIL = "contact@geomacro.live";
const MONTHLY_MAIL =
  `mailto:${BUSINESS_EMAIL}?subject=${encodeURIComponent("Geomacro monthly intelligence access")}`;
const ANNUAL_MAIL =
  `mailto:${BUSINESS_EMAIL}?subject=${encodeURIComponent("Geomacro annual and enterprise intelligence access")}`;

function eventDate(value: string): string {
  return new Date(value).toLocaleString("en-GB", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function AccessOptions() {
  return (
    <div className="mt-5 border-t border-border/55 pt-5">
      <h3 className="text-sm font-semibold tracking-tight sm:text-base">
        Intelligence for your workflow
      </h3>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        For teams, applications and AI agents. Choose how you access it.
      </p>
      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Link
          to="/pricing"
          className="group flex min-h-20 flex-col justify-between gap-2 rounded-xl border border-primary/30 bg-primary/10 px-3.5 py-3 transition-colors hover:border-primary/60 hover:bg-primary/15"
        >
          <span className="flex items-center gap-2 text-xs font-semibold">
            <Zap className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            Pay per call
          </span>
          <span className="inline-flex items-center justify-between gap-2 text-sm font-semibold text-primary">
            From 0.05 USDC
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </span>
        </Link>
        <a
          href={MONTHLY_MAIL}
          className="group flex min-h-20 flex-col justify-between gap-2 rounded-xl border border-border/70 bg-background/30 px-3.5 py-3 transition-colors hover:border-primary/50"
        >
          <span className="flex items-center gap-2 text-xs font-semibold">
            <CalendarDays className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            Monthly access
          </span>
          <span className="inline-flex items-center justify-between gap-2 text-sm font-medium">
            Discuss a plan
            <ArrowRight className="h-3.5 w-3.5 text-primary transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </span>
        </a>
      </div>
      <a
        href={ANNUAL_MAIL}
        className="mt-3 inline-flex w-full items-center justify-between gap-3 rounded-lg px-1 py-2 text-xs text-muted-foreground transition-colors hover:text-primary"
      >
        <span className="inline-flex items-center gap-2">
          <Mail className="h-3.5 w-3.5" aria-hidden="true" />
          Annual & enterprise · Contact sales
        </span>
        <ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      </a>
    </div>
  );
}

/**
 * A single business-facing glimpse of the existing verified Intelligence feed.
 * Keep proof checks inside the canonical serving/selection layers; the homepage
 * never manufactures causal drivers, historical baselines, or forward impacts.
 */
export function LiveIntelligenceShowcase() {
  const intelligence = useIntelligence(null, 5 * 60_000);
  const winner = intelligence.data
    ? selectHomepageShowcase(intelligence.data.all)
    : null;
  const event = winner?.event;
  const gist = event?.title.replace(/^Geomacro finds\s+/u, "") ?? null;
  const themes = FOCUS[event?.category ?? ""] ?? [];

  return (
    <div className="relative mx-auto w-full min-w-0 max-w-xl lg:mx-0 lg:max-w-none">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-4 rounded-[2rem] bg-primary/5 blur-3xl"
      />
      <div className="relative rounded-[1.5rem] border border-border/65 bg-card/85 p-5 shadow-xl shadow-black/10 backdrop-blur sm:p-6 lg:p-7">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
            <Radio className="h-3.5 w-3.5" aria-hidden="true" />
            Geomacro Finds
          </p>
          {event && (
            <span className="rounded-full bg-background/65 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
              {DOMAINS[event.category ?? ""] ?? "Global risk"}
            </span>
          )}
        </div>

        {event && winner && gist ? (
          <div className="mt-5">
            <h2 className="max-w-[34rem] text-[clamp(1.25rem,2vw,1.7rem)] font-semibold leading-snug tracking-[-0.025em]">
              {gist}
            </h2>
            <div className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Clock3 className="h-3 w-3 shrink-0" aria-hidden="true" />
              <time dateTime={winner.observedAt}>{eventDate(winner.observedAt)}</time>
            </div>

            {themes.length > 0 && (
              <div className="mt-5">
                <h3 className="text-xs font-semibold">What to watch</h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  {themes.map((theme) => (
                    <span
                      key={theme}
                      className="rounded-full border border-border/65 bg-background/30 px-2.5 py-1.5 text-[11px] text-muted-foreground"
                    >
                      {theme}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <Link
              to="/intelligence"
              className="group mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline hover:underline-offset-4"
            >
              Explore the risk context
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
          </div>
        ) : (
          <div className="mt-5 rounded-xl border border-border/50 bg-background/25 p-4">
            <p className="text-sm font-medium">
              {intelligence.status === "loading" ? "Finding your next global insight…" : "Explore global risk intelligence"}
            </p>
            <Link
              to="/intelligence"
              className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
            >
              Explore Intelligence
              <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </Link>
          </div>
        )}

        <AccessOptions />
      </div>
    </div>
  );
}
