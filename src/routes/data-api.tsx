import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Bot, Braces, CheckCircle2, LockKeyhole, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AgentCommerceStatus } from "@/components/agent-commerce-status";

const TITLE = "Data & API | Geomacro";
const DESCRIPTION =
  "Geomacro machine access delivers source-protected structured geopolitical, macroeconomic and critical-mineral risk intelligence with runtime-verified x402 status.";
const URL = "https://geomacro.live/data-api";

const OUTPUT = [
  "Assessment and what changed",
  "Why it matters and impact channels",
  "Separate risk-domain context",
  "Confidence, freshness and coverage",
  "What to watch next",
  "Integrity and methodology metadata",
] as const;

export const Route = createFileRoute("/data-api")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: URL },
      { property: "og:image", content: "https://geomacro.live/og-image-v2.png" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: URL }],
  }),
  component: DataApiPage,
});

function DataApiPage() {
  return (
    <main>
      <section className="border-b border-border/60">
        <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 md:py-16">
          <Badge variant="outline" className="font-mono text-[10px] uppercase tracking-[0.14em]">
            GOVERNED DATA · CONTROLLED API · AGENT ACCESS
          </Badge>
          <h1 className="mt-5 max-w-4xl text-4xl font-semibold tracking-tight sm:text-5xl md:text-6xl">
            Structured risk intelligence for software and AI agents.
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg">
            Ask for geopolitical, macroeconomic or critical-mineral risk context. Geomacro returns a governed answer, not a raw evidence dump.
          </p>
          <div className="mt-7 max-w-2xl"><AgentCommerceStatus /></div>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg" className="gap-2">
              <Link to="/intelligence">See the intelligence <ArrowRight className="h-4 w-4" /></Link>
            </Button>
            <Button asChild size="lg" variant="outline"><Link to="/docs">Integration docs</Link></Button>
            <Button asChild size="lg" variant="ghost"><Link to="/contact">Commercial access</Link></Button>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="grid gap-5 lg:grid-cols-3">
          <StatusCard icon={Braces} status="LIVE PRODUCT" title="Structured intelligence" text="A stable governed response shape for assessment, change, impact, confidence, freshness and next signals." />
          <StatusCard icon={Bot} status="RUNTIME STATUS ABOVE" title="x402 machine access" text="Production payment state comes from the live endpoint. Static website copy does not pretend real-money access is enabled when it is not." />
          <StatusCard icon={ShieldCheck} status="PRIVATE PILOT" title="Risk Objects & Risk Gate" text="Signed country and directional-corridor context remains controlled and keeps execution_authorized=false." />
        </div>
        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
          Free Explorer is website/dashboard access, not a free structured API. Real-money x402 access stays fail-closed until the runtime is explicitly authorized.
        </p>
      </section>

      <section className="border-y border-border/60 bg-card/20">
        <div className="mx-auto grid w-full max-w-7xl gap-9 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[0.85fr_1.15fr]">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">What the machine gets</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">Decision context, not source plumbing.</h2>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              Raw source URLs, raw documents, provider details and private retrieval payloads stay internal. Payment cannot widen that boundary.
            </p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {OUTPUT.map((item) => (
              <li key={item} className="flex gap-3 rounded-xl border border-border/70 bg-background/35 p-4 text-sm text-muted-foreground">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="max-w-3xl">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Availability-first x402</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">Prove the answer is deliverable before asking for payment.</h2>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-4">
          <Flow n="01" title="Validate" text="Check query shape, scope and commercial eligibility." />
          <Flow n="02" title="Prepare" text="Prove current intelligence can be safely produced." />
          <Flow n="03" title="Pay" text="Only then issue the runtime x402 payment requirement." />
          <Flow n="04" title="Deliver" text="Return the exact prepared answer with replay protection." />
        </div>
      </section>

      <section className="border-y border-border/60 bg-card/20">
        <div className="mx-auto grid w-full max-w-7xl gap-5 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-3">
          <Boundary title="Source boundary" text="Source-protected output only. Raw evidence and private provenance remain internal." />
          <Boundary title="Scope boundary" text="Current controlled country/corridor design remains endpoint-composed; route_modeling_status = NOT_MODELED." />
          <Boundary title="Execution boundary" text="Risk Gate is advisory context only. execution_authorized=false and customer execution stays customer-controlled." />
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="rounded-2xl border border-primary/25 bg-primary/5 p-7 sm:p-9">
          <LockKeyhole className="h-5 w-5 text-primary" />
          <div className="mt-4 flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Machine access</p>
              <h2 className="mt-2 text-2xl font-semibold">Integrate only what the runtime can prove.</h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Production x402 activation, pricing and provider availability are runtime facts. Geomacro keeps commercial promises narrower than the code that merely exists.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-3">
              <Button asChild><Link to="/contact">Discuss access</Link></Button>
              <Button asChild variant="outline"><Link to="/docs">Open docs</Link></Button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function StatusCard({ icon: Icon, status, title, text }: { icon: typeof Braces; status: string; title: string; text: string }) {
  return (
    <article className="rounded-2xl border border-border/70 bg-card/45 p-6">
      <div className="flex items-center justify-between gap-3">
        <Icon className="h-5 w-5 text-primary" />
        <span className="font-mono text-[9px] uppercase tracking-[0.13em] text-muted-foreground">{status}</span>
      </div>
      <h3 className="mt-4 text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{text}</p>
    </article>
  );
}

function Flow({ n, title, text }: { n: string; title: string; text: string }) {
  return (
    <article className="rounded-2xl border border-border/70 bg-card/35 p-5">
      <span className="font-mono text-xs text-primary">{n}</span>
      <h3 className="mt-4 font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{text}</p>
    </article>
  );
}

function Boundary({ title, text }: { title: string; text: string }) {
  return (
    <article className="rounded-2xl border border-border/70 bg-background/25 p-6">
      <ShieldCheck className="h-5 w-5 text-primary" />
      <h2 className="mt-4 text-lg font-semibold">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{text}</p>
    </article>
  );
}
