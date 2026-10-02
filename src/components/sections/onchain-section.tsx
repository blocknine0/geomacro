import { Activity, ShieldCheck, Zap } from "lucide-react";
import { SectionHeader } from "@/components/section-ui";

export function OnchainSection() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 md:py-24">
      <SectionHeader
        eyebrow="Onchain"
        title="Programmable-finance technical architecture"
        desc="Geomacro keeps programmable-finance integrations isolated from the core intelligence product. Live settlement and execution state is determined by runtime contracts, never by static marketing copy."
      />

      <div className="mt-10 grid gap-4 md:grid-cols-3">
        <article className="rounded-2xl border border-border/60 bg-card/40 p-6">
          <ShieldCheck className="h-5 w-5 text-primary" aria-hidden />
          <h3 className="mt-4 text-base font-semibold">Separated by design</h3>
          <p className="mt-3 text-sm leading-7 text-muted-foreground">
            Public intelligence, Risk Indices and research work without a wallet. Transaction rails remain a secondary integration layer.
          </p>
        </article>

        <article className="rounded-2xl border border-border/60 bg-card/40 p-6">
          <Zap className="h-5 w-5 text-primary" aria-hidden />
          <h3 className="mt-4 text-base font-semibold">Runtime-authoritative access</h3>
          <p className="mt-3 text-sm leading-7 text-muted-foreground">
            Payment and execution availability is read from live service contracts. An inactive rail is never presented as an active production capability.
          </p>
        </article>

        <article className="rounded-2xl border border-border/60 bg-card/40 p-6">
          <Activity className="h-5 w-5 text-primary" aria-hidden />
          <h3 className="mt-4 text-base font-semibold">Machine-ready boundary</h3>
          <p className="mt-3 text-sm leading-7 text-muted-foreground">
            Integrations consume governed Geomacro outputs while custody, transaction signing and execution authorization remain outside the intelligence layer.
          </p>
        </article>
      </div>
    </section>
  );
}
