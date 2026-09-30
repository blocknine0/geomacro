import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Bot, CircleDot, Handshake, Network, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const TITLE = "Ecosystem & Partnerships · Geomacro";
const DESCRIPTION =
  "Geomacro's ecosystem, Circle Alliance membership, technical integrations and partnership model for bringing explainable external-risk intelligence into institutional and AI workflows.";
const URL = "https://geomacro.live/ecosystem";
const CIRCLE_DIRECTORY_URL = "https://partners.circle.com/partner/geomacro";

export const Route = createFileRoute("/ecosystem")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { name: "robots", content: "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: URL },
      { property: "og:image", content: "https://geomacro.live/og-image-v2.png" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: URL }],
  }),
  component: EcosystemPage,
});

function EcosystemPage() {
  return (
    <main>
      <section className="relative overflow-hidden border-b border-border/55">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_82%_18%,color-mix(in_oklab,var(--primary)_12%,transparent),transparent_30%)]" />
        <div className="relative mx-auto grid w-full max-w-7xl gap-10 px-4 py-12 sm:px-6 sm:py-18 lg:grid-cols-[1.05fr_.95fr] lg:items-center lg:py-22">
          <div>
            <Badge variant="outline" className="border-primary/25 bg-primary/5 font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Ecosystem & partnerships</Badge>
            <h1 className="mt-5 text-[clamp(2.8rem,6vw,5.6rem)] font-semibold leading-[0.96] tracking-[-0.05em]">Put external-risk intelligence closer to the workflow that needs it.</h1>
            <p className="mt-6 max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">Geomacro can sit beside financial infrastructure, enterprise workflows, specialist data and AI-agent systems while keeping risk truth governed and final execution customer-controlled.</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Button asChild size="lg" className="h-12 gap-2 px-6"><Link to="/contact">Discuss a partnership <ArrowRight className="h-4 w-4" /></Link></Button>
              <Button asChild size="lg" variant="outline" className="h-12 px-6"><Link to="/institutional">Institutional workflows</Link></Button>
            </div>
          </div>

          <div className="rounded-[1.65rem] border border-primary/20 bg-primary/[0.045] p-6 shadow-2xl shadow-black/15 sm:p-7">
            <CircleDot className="h-6 w-6 text-primary" />
            <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Circle Alliance Program</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">Geomacro is listed in Circle&apos;s Alliance Directory.</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">The public listing is a third-party verification point for Geomacro&apos;s participation in the Circle Alliance ecosystem.</p>
            <a href={CIRCLE_DIRECTORY_URL} target="_blank" rel="noreferrer" className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline">Verify directory listing <ArrowRight className="h-4 w-4" /></a>
            <p className="mt-5 border-t border-border/60 pt-4 text-xs leading-5 text-muted-foreground">Alliance membership is ecosystem participation. It does not mean Circle endorses Geomacro&apos;s risk methodology, scores, customer decisions or future commercial services.</p>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 sm:py-20">
        <div className="max-w-3xl">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">Partnership paths</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">Integrate intelligence where decisions already happen.</h2>
        </div>
        <div className="mt-9 grid gap-4 md:grid-cols-2">
          <PartnerCard icon={Network} title="Infrastructure & distribution" text="Embed or distribute Geomacro context through workflow platforms, data products or financial infrastructure." />
          <PartnerCard icon={Bot} title="AI & agent ecosystems" text="Give software and agents governed external-risk context before customer policy decides what happens next." />
          <PartnerCard icon={ShieldCheck} title="Data & risk providers" text="Combine complementary evidence or controls while preserving provenance, rights and explicit product boundaries." />
          <PartnerCard icon={Handshake} title="Design & go-to-market" text="Validate a narrow risk workflow, prove repeat use and bring the capability to the right professional users." />
        </div>
      </section>

      <section className="border-y border-border/55 bg-card/15">
        <div className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 sm:py-20">
          <div className="max-w-3xl">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">Responsibility boundary</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">Integrate the risk context. Keep responsibility explicit.</h2>
          </div>
          <div className="mt-9 grid gap-4 lg:grid-cols-3">
            <Boundary title="Geomacro provides" text="Geopolitical, macroeconomic and critical-mineral risk context, confidence, provenance and bounded machine-readable decision context." />
            <Boundary title="Partners can provide" text="Distribution, complementary data, infrastructure, workflow integration, domain controls or go-to-market reach." />
            <Boundary title="The customer retains" text="Identity, permissions, policy, compliance, funds, execution authority and the final decision." />
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 sm:py-20">
        <div className="overflow-hidden rounded-[1.75rem] border border-primary/20 bg-[linear-gradient(135deg,color-mix(in_oklab,var(--primary)_10%,transparent),transparent_58%)] p-6 sm:p-9 lg:flex lg:items-center lg:justify-between lg:gap-10">
          <div className="max-w-3xl">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">Build with Geomacro</p>
            <h2 className="mt-3 text-2xl font-semibold sm:text-3xl">Have distribution, data, infrastructure or a customer workflow that fits?</h2>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">Bring the concrete integration point. We will keep commercial product, pilot capability and technical proof clearly separated.</p>
          </div>
          <div className="mt-7 flex shrink-0 gap-3 lg:mt-0">
            <Button asChild size="lg"><Link to="/contact">Start a conversation</Link></Button>
            <Button asChild size="lg" variant="outline"><Link to="/about">Trust boundaries</Link></Button>
          </div>
        </div>
      </section>
    </main>
  );
}

function PartnerCard({ icon: Icon, title, text }: { icon: typeof Network; title: string; text: string }) {
  return (
    <article className="group rounded-2xl border border-border/60 bg-card/35 p-6 transition hover:-translate-y-0.5 hover:border-primary/30 hover:bg-card/55">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary"><Icon className="h-5 w-5" /></div>
      <h3 className="mt-5 text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
    </article>
  );
}

function Boundary({ title, text }: { title: string; text: string }) {
  return (
    <article className="rounded-2xl border border-border/60 bg-background/30 p-5 sm:p-6">
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
    </article>
  );
}
