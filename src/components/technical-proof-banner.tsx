import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

export function TechnicalProofBanner({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <section className="border-b border-border/60 bg-card/20">
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">TECHNICAL PROOF · SECONDARY APPLICATION LAYER</p>
            <h1 className="mt-1 text-lg font-semibold text-foreground">{title}</h1>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">{description}</p>
          </div>
          <Link to="/intelligence" className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary hover:underline">
            Primary intelligence product <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
