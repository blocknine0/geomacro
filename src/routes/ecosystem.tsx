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
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
    ],
    links: [{ rel: "canonical", href: URL }],
  }),
  component: EcosystemPage,
});

function EcosystemPage() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
      <section className="max-w-4xl">
        <Badge variant="outline" className="border-primary/40 bg-primary/5 font-mono text-[11px] uppercase tracking-[0.14em] text-primary">
          Ecosystem & partnerships
        </Badge>
        <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl md:text-6xl">
          Put external-risk intelligence closer to the decisions that need it.
        </h1>
        <p className="mt-5 max-w-3xl text-lg leading-relaxed text-muted-foreground">
          Geomacro is building an explainable risk-intelligence layer that can connect with institutional workflows, financial infrastructure, data systems and AI-agent platforms without taking control of the customer's policy or execution.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild size="lg" className="gap-2"><Link to="/contact">Discuss a partnership <ArrowRight className="h-4 w-4" /></Link></Button>
          <Button asChild size="lg" variant="outline"><Link to="/institutional">See institutional workflows</Link></Button>
        </div>
      </section>

      <section className="mt-14 rounded-3xl border border-primary/25 bg-primary/[0.04] p-7 sm:p-9">
        <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
          <div>
            <CircleDot className="h-7 w-7 text-primary" />
            <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Circle Alliance Program</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">Geomacro is listed in Circle's Alliance Directory.</h2>
          </div>
          <div>
            <p className="text-base leading-relaxed text-muted-foreground">
              Geomacro participates in the Circle Alliance ecosystem alongside its work with USDC, Circle infrastructure and Arc technical proof. The public directory listing provides a third-party verification point for the membership.
            </p>
            <a
              href={CIRCLE_DIRECTORY_URL}
              target="_blank"
              rel="noreferrer"
              className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
            >
              Verify Geomacro in the Circle Alliance Directory <ArrowRight className="h-4 w-4" />
            </a>
            <div className="mt-6 rounded-xl border border-border/70 bg-background/35 p-4">
              <p className="text-sm leading-relaxed text-muted-foreground">
                Alliance membership is ecosystem participation. It does not mean Circle endorses Geomacro's risk methodology, scores, customer decisions or future commercial services. Geomacro remains responsible for its own product, methodology and customer commitments.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-14">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Where partnerships fit</p>
        <h2 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight">Geomacro is most useful when risk context can reach the workflow before a decision is made.</h2>
        <div className="mt-8 grid gap-5 md:grid-cols-2">
          <PartnerCard icon={Network} title="Infrastructure & distribution" text="Embed or distribute Geomacro risk context through financial infrastructure, workflow platforms, data products or agent marketplaces." />
          <PartnerCard icon={Bot} title="AI & agent ecosystems" text="Give autonomous or semi-autonomous systems governed external-risk context before the customer's own policy and permissions layer decides what happens next." />
          <PartnerCard icon={ShieldCheck} title="Data & risk providers" text="Combine complementary evidence, specialist datasets or decision controls while preserving source rights, provenance and explicit product boundaries." />
          <PartnerCard icon={Handshake} title="Design & go-to-market partners" text="Validate a narrow country, corridor, treasury or operational workflow and help bring the resulting capability to the right professional users." />
        </div>
      </section>

      <section className="mt-14 grid gap-5 lg:grid-cols-3">
        <Boundary title="Geomacro provides" text="External geopolitical, macroeconomic and critical-mineral risk context, evidence, confidence, provenance and bounded machine-readable decision context." />
        <Boundary title="Partners can provide" text="Distribution, complementary data, infrastructure, customer workflows, implementation support, go-to-market reach or domain-specific controls." />
        <Boundary title="The customer retains" text="Identity, permissions, policy, compliance responsibilities, funds, execution authority and the final decision." />
      </section>

      <section className="mt-14 rounded-3xl border border-border/70 bg-card/45 p-7 sm:p-9">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Partnership principle</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight">Integrate the risk context. Do not blur the responsibility boundary.</h2>
        <p className="mt-4 max-w-4xl text-base leading-relaxed text-muted-foreground">
          Geomacro is designed to add external-risk intelligence to an existing decision stack. It does not replace customer identity, permissions, sanctions or compliance screening, internal policy, fiduciary judgment or transaction execution.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Button asChild><Link to="/contact">Start a partnership conversation</Link></Button>
          <Button asChild variant="outline"><Link to="/about">Review trust boundaries</Link></Button>
          <Button asChild variant="ghost"><Link to="/docs">Technical documentation</Link></Button>
        </div>
      </section>
    </main>
  );
}

function PartnerCard({ icon: Icon, title, text }: { icon: typeof Network; title: string; text: string }) {
  return (
    <article className="rounded-2xl border border-border/70 bg-card/45 p-6">
      <Icon className="h-5 w-5 text-primary" />
      <h3 className="mt-4 text-xl font-semibold">{title}</h3>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{text}</p>
    </article>
  );
}

function Boundary({ title, text }: { title: string; text: string }) {
  return (
    <article className="rounded-2xl border border-border/70 bg-background/35 p-6">
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{text}</p>
    </article>
  );
}
