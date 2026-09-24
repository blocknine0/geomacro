import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  CheckCircle2,
  CircleDollarSign,
  Code2,
  Copy,
  ExternalLink,
  Loader2,
  MessageSquareText,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/demo")({
  head: () => ({
    meta: [
      { title: "Agentic Commerce Demo | Geomacro" },
      {
        name: "description",
        content:
          "Test Geomacro's signed geopolitical risk pre-flight, structural evidence context and Circle x402 USDC agent-access path on Arc Testnet.",
      },
      { property: "og:title", content: "Agentic Commerce Demo | Geomacro" },
      {
        property: "og:description",
        content:
          "Run a Risk Gate pre-flight and inspect the machine-readable response, structural context and Circle x402 access path.",
      },
      { property: "og:url", content: "https://geomacro.live/demo" },
    ],
    links: [{ rel: "canonical", href: "https://geomacro.live/demo" }],
  }),
  component: AgenticCommerceDemoPage,
});

type DemoResult = {
  ok: boolean;
  request_id: string;
  mode: "PUBLIC_SANDBOX" | "X402_PAID";
  payment: Record<string, unknown>;
  risk_gate: {
    decision: "CONTINUE" | "REDUCE_LIMIT" | "REQUIRE_APPROVAL" | "PAUSE";
    reason_codes: string[];
    risk: {
      object_id: string;
      score: number;
      label: string;
      previous_score: number | null;
      delta: number | null;
      confidence: number;
      verification_status: string;
      commercial_eligibility_status: string;
      generated_at: string;
      expires_at: string;
      methodology_version: string;
    };
    top_drivers: Array<{
      driver: string;
      score_contribution: number;
      delta_contribution: number | null;
    }>;
    execution_authorized: false;
  };
  risk_object: {
    schema_version: string;
    object_id: string;
    subject: { type: string; id: string; name?: string };
    methodology_version: string;
    integrity: {
      payload_hash?: string;
      calculation_hash?: string;
      signature?: string;
      signature_scheme?: string;
      signing_key_id?: string;
    };
    generated_at: string;
    expires_at: string;
  };
  structural_context: {
    status: string;
    methodology_status: string;
    note: string;
    observations: Array<{
      observation_id: string;
      dimension: string;
      country_iso3: string | null;
      partner_country_iso3: string | null;
      observed_at: string | null;
      metric: string;
      value_numeric: number | null;
      value_text: string | null;
      unit: string | null;
      source_id: string;
      source_url: string | null;
    }>;
  };
  gri_context: null | {
    id: string;
    as_of: string;
    display_score: number | null;
    change_points: number | string | null;
    coverage: number | string;
    weighted_confidence: number | string | null;
    methodology_version: string;
    proof_hash: string | null;
    verification_status: string | null;
  };
  boundaries: {
    execution_authorized: false;
    structural_evidence_is_not_gri_v1_2_input: true;
    corridor_model: string;
  };
};

const inputClass =
  "h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none transition focus:border-primary/60";

function AgenticCommerceDemoPage() {
  const [scenario, setScenario] = useState("USA>CHN");
  const [policy, setPolicy] = useState("cautious");
  const [actionType, setActionType] = useState("agent_payment");
  const [amount, setAmount] = useState("10000");
  const [result, setResult] = useState<DemoResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestBody = useMemo(() => {
    const subject = scenario.includes(">")
      ? {
          type: "corridor" as const,
          origin_country_iso3: scenario.split(">")[0],
          destination_country_iso3: scenario.split(">")[1],
        }
      : { type: "country" as const, country_iso3: scenario };

    return {
      subject,
      policy_preset: policy,
      action_type: actionType,
      amount_usdc: Number(amount),
    };
  }, [actionType, amount, policy, scenario]);

  async function runDemo() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/demo/preflight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const body = (await response.json()) as DemoResult & {
        error?: { message?: string };
      };
      if (!response.ok || !body.ok) {
        throw new Error(body.error?.message ?? `Demo request failed with HTTP ${response.status}`);
      }
      setResult(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The demo could not complete.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-4 pb-24 pt-10 sm:px-6 sm:pt-14">
      <section className="max-w-4xl">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="border-primary/35 bg-primary/5 text-primary">
            TECHNICAL DEMO
          </Badge>
          <Badge variant="outline">PUBLIC SANDBOX</Badge>
          <Badge variant="outline">CIRCLE x402 · ARC TESTNET</Badge>
        </div>
        <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl md:text-6xl">
          See what an agent receives before it moves money.
        </h1>
        <p className="mt-5 max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg">
          Pick a country or corridor, choose a sample policy and run a Risk Gate pre-flight against Geomacro's signed risk data. The browser sandbox is free. A separate machine endpoint uses Circle x402 and USDC for pay-per-call access on Arc Testnet.
        </p>
        <p className="mt-4 max-w-3xl text-sm leading-6 text-muted-foreground">
          This demo does not move funds. Structural observations are shown as evidence context and are not silently added to GRI v1.2. The current corridor model compares the two endpoints; it is not full logistics, route or counterparty analysis.
        </p>
      </section>

      <section className="mt-10 grid gap-6 lg:grid-cols-[0.82fr_1.18fr]">
        <div className="rounded-2xl border border-border/70 bg-card/45 p-5 sm:p-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            1 · Choose a test case
          </p>
          <div className="mt-5 grid gap-4">
            <Field label="Country / corridor">
              <select className={inputClass} value={scenario} onChange={(e) => setScenario(e.target.value)}>
                <option value="USA>CHN">United States → China</option>
                <option value="CHN>USA">China → United States</option>
                <option value="USA">United States</option>
                <option value="CHN">China</option>
              </select>
            </Field>
            <Field label="Customer policy">
              <select className={inputClass} value={policy} onChange={(e) => setPolicy(e.target.value)}>
                <option value="balanced">Balanced</option>
                <option value="cautious">Cautious</option>
                <option value="strict">Strict</option>
              </select>
            </Field>
            <Field label="Action">
              <select className={inputClass} value={actionType} onChange={(e) => setActionType(e.target.value)}>
                <option value="agent_payment">Agent payment</option>
                <option value="treasury_payment">Treasury payment</option>
                <option value="vendor_payment">Vendor payment</option>
                <option value="exposure_review">Exposure review</option>
              </select>
            </Field>
            <Field label="Illustrative amount (USDC)">
              <input
                className={inputClass}
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, "").slice(0, 16))}
              />
            </Field>
            <Button onClick={() => void runDemo()} disabled={loading || !Number(amount)} className="mt-1 h-11 gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              {loading ? "Running pre-flight" : "Run pre-flight"}
            </Button>
          </div>
        </div>

        <div className="min-h-[420px] rounded-2xl border border-border/70 bg-card/45 p-5 sm:p-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            2 · Inspect the result
          </p>
          {loading ? (
            <div className="flex min-h-[320px] items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Verifying the current signed Risk Object…
            </div>
          ) : error ? (
            <div className="mt-6 rounded-xl border border-destructive/35 bg-destructive/5 p-4">
              <p className="font-medium text-destructive">The demo failed closed.</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{error}</p>
              <p className="mt-3 text-xs text-muted-foreground">
                A missing, stale or unverifiable risk resource is not converted into an approval.
              </p>
            </div>
          ) : result ? (
            <ResultPanel result={result} />
          ) : (
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {[
                ["Signed Risk Object", "Risk score, confidence, attribution, freshness and signature proof."],
                ["Structural context", "Commercially eligible country and dyadic evidence, shown separately from GRI."],
                ["Risk Gate policy", "A sample customer policy converts risk context into a pre-flight recommendation."],
                ["Execution boundary", "The response always preserves execution_authorized = false."],
              ].map(([title, body]) => (
                <div key={title} className="rounded-xl border border-border/60 bg-background/25 p-4">
                  <p className="text-sm font-medium">{title}</p>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">{body}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <AgentEndpoint requestBody={requestBody} />
      <CircleProof />
      <FeedbackPanel requestId={result?.request_id ?? null} />
    </main>
  );
}

function ResultPanel({ result }: { result: DemoResult }) {
  const gate = result.risk_gate;
  const confidence = Math.round(gate.risk.confidence * 100);
  return (
    <div className="mt-5 space-y-5">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-start">
        <div>
          <p className="text-xs text-muted-foreground">Risk Gate recommendation</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight">{gate.decision.replaceAll("_", " ")}</p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">{gate.reason_codes.join(" · ")}</p>
        </div>
        <div className="rounded-xl border border-border/60 bg-background/30 px-4 py-3 font-mono text-xs">
          execution_authorized = false
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Risk" value={`${gate.risk.score.toFixed(1)} · ${gate.risk.label}`} />
        <Metric label="Change" value={gate.risk.delta == null ? "—" : `${gate.risk.delta >= 0 ? "+" : ""}${gate.risk.delta.toFixed(1)}`} />
        <Metric label="Confidence" value={`${confidence}%`} />
        <Metric label="Verification" value={gate.risk.verification_status} />
      </div>

      <div className="rounded-xl border border-border/60 bg-background/25 p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium">Top risk drivers</p>
          <span className="font-mono text-[10px] text-muted-foreground">{gate.risk.methodology_version}</span>
        </div>
        <div className="mt-3 space-y-2">
          {gate.top_drivers.map((driver) => (
            <div key={driver.driver} className="flex items-center justify-between gap-4 text-sm">
              <span>{driver.driver.replaceAll("_", " ")}</span>
              <span className="font-mono text-xs text-muted-foreground">
                {driver.score_contribution >= 0 ? "+" : ""}{driver.score_contribution.toFixed(2)} pts
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-border/60 bg-background/25 p-4">
          <p className="text-sm font-medium">Signed object</p>
          <KeyValue label="Object" value={result.risk_object.object_id} />
          <KeyValue label="Schema" value={result.risk_object.schema_version} />
          <KeyValue label="Signing key" value={result.risk_object.integrity.signing_key_id ?? "—"} />
          <KeyValue label="Signature" value={shortHash(result.risk_object.integrity.signature)} />
          <KeyValue label="Payload hash" value={shortHash(result.risk_object.integrity.payload_hash)} />
        </div>
        <div className="rounded-xl border border-border/60 bg-background/25 p-4">
          <p className="text-sm font-medium">Global context</p>
          {result.gri_context ? (
            <>
              <KeyValue label="GRI" value={String(result.gri_context.display_score ?? "—")} />
              <KeyValue label="Change" value={String(result.gri_context.change_points ?? "—")} />
              <KeyValue label="Version" value={result.gri_context.methodology_version} />
              <KeyValue label="Proof" value={shortHash(result.gri_context.proof_hash)} />
            </>
          ) : (
            <p className="mt-2 text-xs leading-5 text-muted-foreground">Verified GRI context is unavailable in this runtime.</p>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-border/60 bg-background/25 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium">Structural evidence</p>
            <p className="mt-1 text-xs text-muted-foreground">{result.structural_context.methodology_status}</p>
          </div>
          <Badge variant="outline">{result.structural_context.status}</Badge>
        </div>
        <p className="mt-3 text-xs leading-5 text-muted-foreground">{result.structural_context.note}</p>
        {result.structural_context.observations.length > 0 ? (
          <div className="mt-4 grid gap-2">
            {result.structural_context.observations.slice(0, 6).map((row) => (
              <div key={row.observation_id} className="rounded-lg border border-border/50 p-3 text-xs">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <span className="font-medium text-foreground">{row.dimension.replaceAll("_", " ")}</span>
                  <span className="font-mono text-muted-foreground">{row.country_iso3}{row.partner_country_iso3 ? ` → ${row.partner_country_iso3}` : ""}</span>
                </div>
                <p className="mt-1 text-muted-foreground">
                  {row.metric}: {row.value_text ?? row.value_numeric ?? "reported"}{row.unit ? ` ${row.unit}` : ""}
                </p>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <details className="rounded-xl border border-border/60 bg-background/25 p-4">
        <summary className="cursor-pointer text-sm font-medium">Machine-readable response</summary>
        <pre className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-background p-3 font-mono text-[11px] leading-5 text-muted-foreground">
          {JSON.stringify(result, null, 2)}
        </pre>
      </details>
    </div>
  );
}

function AgentEndpoint({ requestBody }: { requestBody: unknown }) {
  const body = JSON.stringify(requestBody, null, 2);
  const curl = `curl -i -X POST https://geomacro.live/api/agent/risk \\
  -H 'content-type: application/json' \\
  -d '${JSON.stringify(requestBody)}'`;
  const circleCli = `circle services pay https://geomacro.live/api/agent/risk \\
  --address "$AGENT_WALLET_ADDRESS" \\
  --chain ARC-TESTNET \\
  -X POST \\
  --max-amount 0.001 \\
  -H 'content-type: application/json' \\
  -d '${JSON.stringify(requestBody)}' \\
  --output json`;

  return (
    <section className="mt-14 border-t border-border pt-12">
      <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Agent access</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight">The same risk resource, priced per call.</h2>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            The machine endpoint uses HTTP 402, Circle Gateway batching and USDC on Arc Testnet. An unpaid valid request receives payment requirements; an x402-aware agent can pay and retry the same call.
          </p>
          <div className="mt-5 rounded-xl border border-border/60 bg-card/45 p-4 text-sm">
            <div className="flex items-center gap-2"><CircleDollarSign className="h-4 w-4 text-primary" /><span className="font-medium">0.001 USDC per test call</span></div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">Testnet demo price only. It is not Geomacro's institutional pricing.</p>
          </div>
        </div>
        <div className="space-y-3">
          <CodeBlock title="1 · Check the unpaid 402 response" code={curl} />
          <CodeBlock title="2 · Pay with a Circle Agent Wallet / CLI" code={circleCli} />
          <details className="rounded-xl border border-border/60 bg-card/45 p-4">
            <summary className="cursor-pointer text-sm font-medium">Current request JSON</summary>
            <pre className="mt-3 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-5 text-muted-foreground">{body}</pre>
          </details>
        </div>
      </div>
    </section>
  );
}

function CircleProof() {
  const repo = "https://github.com/blocknine0/geomacro/blob/main";
  return (
    <section className="mt-14 border-t border-border pt-12">
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Circle / Arc code proof</p>
      <h2 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight">What is implemented in the source of truth.</h2>
      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          ["CCTP V2", "USDC burn-and-mint, Iris attestation and Arc Testnet receive flow.", `${repo}/src/lib/cctp.ts`],
          ["Circle App Kit", "Arc Testnet quotes, token rates, swaps and status recovery.", `${repo}/src/lib/swap.ts`],
          ["Circle x402", "Gateway payment requirements, verification, settlement and paid resource delivery.", `${repo}/src/lib/circle-x402.server.ts`],
          ["Risk Gate", "Signed external risk context before customer-controlled execution.", `${repo}/src/lib/risk-gate-engine.ts`],
        ].map(([title, cardBody, href]) => (
          <a key={title} href={href} target="_blank" rel="noreferrer" className="rounded-2xl border border-border/70 bg-card/45 p-5 transition hover:border-primary/40">
            <Code2 className="h-5 w-5 text-primary" />
            <p className="mt-3 font-medium">{title}</p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">{cardBody}</p>
            <span className="mt-4 inline-flex items-center gap-1 text-xs text-primary">Open code <ExternalLink className="h-3 w-3" /></span>
          </a>
        ))}
      </div>
    </section>
  );
}

function FeedbackPanel({ requestId }: { requestId: string | null }) {
  const [testerType, setTesterType] = useState("builder");
  const [outcome, setOutcome] = useState("worked");
  const [rating, setRating] = useState(4);
  const [wouldIntegrate, setWouldIntegrate] = useState<boolean | null>(null);
  const [valuable, setValuable] = useState("");
  const [friction, setFriction] = useState("");
  const [missing, setMissing] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function submit() {
    setSending(true);
    setStatus(null);
    try {
      const response = await fetch("/api/demo/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request_id: requestId,
          demo_mode: "PUBLIC_SANDBOX",
          tester_type: testerType,
          rating,
          would_integrate: wouldIntegrate,
          outcome,
          most_valuable: valuable,
          friction,
          missing_capability: missing,
        }),
      });
      const responseBody = (await response.json()) as { ok?: boolean; message?: string; error?: string };
      if (!response.ok || !responseBody.ok) throw new Error(responseBody.error ?? "Feedback could not be saved.");
      setStatus(responseBody.message ?? "Thanks for the feedback.");
      setValuable("");
      setFriction("");
      setMissing("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Feedback could not be saved.");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="mt-14 border-t border-border pt-12">
      <div className="grid gap-8 lg:grid-cols-[0.72fr_1.28fr]">
        <div>
          <MessageSquareText className="h-6 w-6 text-primary" />
          <h2 className="mt-4 text-3xl font-semibold tracking-tight">Tell us where the demo breaks down.</h2>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            Useful feedback is specific: what you tried, what was unclear, what your agent could not consume, or what would stop you using this in a real workflow. The feedback table does not store your IP address or wallet address.
          </p>
          <p className="mt-4 text-sm text-muted-foreground">
            For a longer technical conversation, use the <Link to="/contact" className="text-primary underline-offset-4 hover:underline">contact page</Link>.
          </p>
        </div>
        <div className="rounded-2xl border border-border/70 bg-card/45 p-5 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="You are testing as">
              <select className={inputClass} value={testerType} onChange={(e) => setTesterType(e.target.value)}>
                <option value="builder">Builder / developer</option>
                <option value="agent_project">Agent project</option>
                <option value="institution">Institution / professional team</option>
                <option value="researcher">Researcher / analyst</option>
                <option value="other">Other</option>
              </select>
            </Field>
            <Field label="What happened">
              <select className={inputClass} value={outcome} onChange={(e) => setOutcome(e.target.value)}>
                <option value="worked">Worked</option>
                <option value="partly_worked">Partly worked</option>
                <option value="blocked">Blocked</option>
                <option value="exploring">Still exploring</option>
              </select>
            </Field>
            <Field label="Usefulness (1–5)">
              <select className={inputClass} value={rating} onChange={(e) => setRating(Number(e.target.value))}>
                {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </Field>
            <Field label="Would you integrate this?">
              <select className={inputClass} value={wouldIntegrate == null ? "" : String(wouldIntegrate)} onChange={(e) => setWouldIntegrate(e.target.value === "" ? null : e.target.value === "true")}>
                <option value="">Not sure yet</option>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </Field>
          </div>
          <div className="mt-4 grid gap-4">
            <TextArea label="What was most useful?" value={valuable} onChange={setValuable} maxLength={1000} />
            <TextArea label="What was confusing, slow or broken?" value={friction} onChange={setFriction} maxLength={2000} />
            <TextArea label="What capability is missing for your workflow?" value={missing} onChange={setMissing} maxLength={1000} />
          </div>
          <Button className="mt-5 gap-2" disabled={sending} onClick={() => void submit()}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {sending ? "Saving feedback" : "Send feedback"}
          </Button>
          {status ? <p className="mt-3 text-xs leading-5 text-muted-foreground">{status}</p> : null}
        </div>
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-2 text-sm">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function TextArea({ label, value, onChange, maxLength }: { label: string; value: string; onChange: (value: string) => void; maxLength: number }) {
  return (
    <label className="grid gap-2 text-sm">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <textarea
        value={value}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-24 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary/60"
      />
    </label>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/25 p-3">
      <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="mt-1 break-words text-sm font-medium">{value}</p>
    </div>
  );
}

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-3 grid grid-cols-[90px_1fr] gap-3 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 break-all font-mono text-foreground">{value}</span>
    </div>
  );
}

function CodeBlock({ title, code }: { title: string; code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-xl border border-border/60 bg-card/45 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">{title}</p>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(code);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1200);
          }}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <Copy className="h-3.5 w-3.5" /> {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="mt-3 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-background p-3 font-mono text-[11px] leading-5 text-muted-foreground">{code}</pre>
    </div>
  );
}

function shortHash(value?: string | null) {
  if (!value) return "—";
  if (value.length <= 20) return value;
  return `${value.slice(0, 10)}…${value.slice(-8)}`;
}
