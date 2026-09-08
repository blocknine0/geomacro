import { Link } from "@tanstack/react-router";
import { ArrowRight, Search, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

const EXAMPLES = [
  "What changed today?",
  "Why did the GRI move?",
  "What are the biggest emerging risks?",
] as const;

export function AskPreview() {
  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
      <div className="grid gap-8 rounded-2xl border border-border/70 bg-card/45 p-6 sm:p-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">
            Ask Geomacro · Live
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight">
            Ask a risk question. See the evidence behind the answer.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            Ask Geomacro is a dedicated research workspace, not a generic chatbot. It answers from Geomacro's stored intelligence and the same verified GRI used elsewhere on the site, then shows the records that support the answer.
          </p>
          <Button asChild className="mt-6 gap-2">
            <Link to="/ask-geomacro">
              Open Ask Geomacro <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>

        <div className="rounded-2xl border border-border/60 bg-background/35 p-5">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Search className="h-4 w-4 text-primary" /> Useful starting questions
          </div>
          <div className="mt-4 space-y-2">
            {EXAMPLES.map((example) => (
              <Link
                key={example}
                to="/ask-geomacro"
                className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card/30 px-4 py-3 text-sm text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
              >
                <span>{example}</span>
                <ArrowRight className="h-4 w-4 shrink-0" />
              </Link>
            ))}
          </div>
          <div className="mt-4 flex items-start gap-2 border-t border-border/60 pt-4 text-xs leading-relaxed text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>If the stored evidence is not strong enough, Geomacro says so instead of inventing an answer.</span>
          </div>
        </div>
      </div>
    </section>
  );
}
