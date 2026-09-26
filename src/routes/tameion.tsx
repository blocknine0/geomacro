import { createFileRoute, Link } from "@tanstack/react-router";
import { BrowserProvider, type Eip1193Provider } from "ethers";
import { useMemo, useState } from "react";
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ARC_TESTNET } from "@/lib/arc";
import { TREASURY_ADDRESS } from "@/lib/protocol-fee";

export const Route = createFileRoute("/tameion")({
  head: () => ({
    meta: [
      { title: "Tameion Agent Mode | Geomacro" },
      {
        name: "description",
        content:
          "A bounded autonomous-business workflow using Geomacro Risk Gate, human approval thresholds and Arc Testnet USDC payment verification.",
      },
      { property: "og:title", content: "Geomacro Tameion Agent Mode" },
      {
        property: "og:description",
        content:
          "Risk-aware AI business decisions, policy limits, human escalation and verifiable Arc Testnet USDC execution.",
      },
      { property: "og:url", content: "https://geomacro.live/tameion" },
    ],
    links: [{ rel: "canonical", href: "https://geomacro.live/tameion" }],
  }),
  component: TameionAgentPage,
});

type DecisionResult = {
  ok: true;
  audit_id: string;
  expires_at: string;
  status: "AUTO_EXECUTE_READY" | "AWAITING_APPROVAL" | "BLOCKED";
  action_context: {
    action_type: string;
    amount_usdc: string;
    recipient: string;
  };
  risk_gate: {
    decision: "CONTINUE" | "REDUCE_LIMIT" | "REQUIRE_APPROVAL" | "PAUSE";
    recommended_action: "ALLOW" | "REDUCE_EXPOSURE" | "REQUIRE_HUMAN_APPROVAL" | "BLOCK";
    reason_codes: string[];
    risk: {
      score: number;
      label: string;
      confidence: number;
      object_id: string;
    };
    execution_authorized: false;
  };
  agent_decision: {
    action: "AUTO_EXECUTE" | "REQUIRE_APPROVAL" | "BLOCK";
    reason_codes: string[];
    policy: {
      auto_execute_max_usdc: number;
      human_approval_max_usdc: number;
    };
  };
  human_approval: {
    required: boolean;
    message: string | null;
  };
  payment_intent: null | {
    network: string;
    chain_id: number;
    chain_id_hex: string;
    currency: "USDC";
    native_asset: true;
    recipient: string;
    amount_usdc: string;
    amount_atomic: string;
    explorer: string;
  };
};

type ConfirmResult = {
  ok: true;
  audit_id: string;
  status: "EXECUTED";
  tx_hash: string;
  block_number: number;
  explorer_url: string;
};

type ApiError = { error?: { code?: string; message?: string } };

const inputClass =
  "h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none transition focus:border-primary/60";

async function apiPost<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as (T & ApiError) | null;
  if (!response.ok || !payload || payload.error) {
    throw new Error(payload?.error?.message ?? payload?.error?.code ?? `Request failed with HTTP ${response.status}`);
  }
  return payload as T;
}

function injectedProvider() {
  return (window as unknown as { ethereum?: Eip1193Provider }).ethereum;
}

async function ensureArcWallet() {
  const eth = injectedProvider();
  if (!eth) throw new Error("No EVM wallet found. Install or open a browser wallet first.");

  await eth.request({ method: "eth_requestAccounts" });
  const current = String(await eth.request({ method: "eth_chainId" })).toLowerCase();
  if (current !== ARC_TESTNET.chainIdHex.toLowerCase()) {
    try {
      await eth.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: ARC_TESTNET.chainIdHex }],
      });
    } catch (error) {
      const code = (error as { code?: number }).code;
      if (code !== 4902 && code !== -32603) throw error;
      await eth.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: ARC_TESTNET.chainIdHex,
            chainName: ARC_TESTNET.chainName,
            rpcUrls: [ARC_TESTNET.rpcUrl],
            nativeCurrency: ARC_TESTNET.currency,
            blockExplorerUrls: [ARC_TESTNET.explorer],
          },
        ],
      });
    }
  }

  const provider = new BrowserProvider(eth);
  const signer = await provider.getSigner();
  return { provider, signer, address: await signer.getAddress() };
}

function TameionAgentPage() {
  const [scenario, setScenario] = useState("USA>CHN");
  const [policy, setPolicy] = useState("balanced");
  const [actionType, setActionType] = useState("agent_payment");
  const [amount, setAmount] = useState("1");
  const [recipient, setRecipient] = useState(TREASURY_ADDRESS);
  const [decision, setDecision] = useState<DecisionResult | null>(null);
  const [approved, setApproved] = useState(false);
  const [confirmed, setConfirmed] = useState<ConfirmResult | null>(null);
  const [busy, setBusy] = useState<"decision" | "approval" | "payment" | null>(null);
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
      amount_usdc: amount,
      recipient,
      client_request_id: `tameion-web-${Date.now()}`,
    };
  }, [actionType, amount, policy, recipient, scenario]);

  async function runDecision() {
    setBusy("decision");
    setError(null);
    setDecision(null);
    setApproved(false);
    setConfirmed(null);
    try {
      setDecision(await apiPost<DecisionResult>("/api/tameion/decision", requestBody));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Decision request failed.");
    } finally {
      setBusy(null);
    }
  }

  async function approveDecision() {
    if (!decision?.human_approval.message) return;
    setBusy("approval");
    setError(null);
    try {
      const { signer, address } = await ensureArcWallet();
      const signature = await signer.signMessage(decision.human_approval.message);
      await apiPost("/api/tameion/approve", {
        audit_id: decision.audit_id,
        approver_address: address,
        signature,
      });
      setApproved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Human approval failed.");
    } finally {
      setBusy(null);
    }
  }

  async function executePayment() {
    if (!decision?.payment_intent) return;
    if (decision.agent_decision.action === "REQUIRE_APPROVAL" && !approved) {
      setError("Human approval is required before this payment can be sent.");
      return;
    }

    setBusy("payment");
    setError(null);
    try {
      const { signer } = await ensureArcWallet();
      const tx = await signer.sendTransaction({
        to: decision.payment_intent.recipient,
        value: BigInt(decision.payment_intent.amount_atomic),
      });
      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) {
        throw new Error("Arc Testnet payment did not confirm successfully.");
      }
      const result = await apiPost<ConfirmResult>("/api/tameion/confirm", {
        audit_id: decision.audit_id,
        tx_hash: receipt.hash,
      });
      setConfirmed(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Arc Testnet payment failed.");
    } finally {
      setBusy(null);
    }
  }

  const paymentAllowed =
    Boolean(decision?.payment_intent) &&
    decision?.agent_decision.action !== "BLOCK" &&
    (decision?.agent_decision.action !== "REQUIRE_APPROVAL" || approved);

  return (
    <main className="mx-auto w-full max-w-7xl px-4 pb-24 pt-10 sm:px-6 sm:pt-14">
      <section className="max-w-4xl">
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="border-primary/35 bg-primary/5 text-primary">TAMEION AGENT MODE</Badge>
          <Badge variant="outline">RFB 4 · AUTONOMOUS BUSINESS OPERATOR</Badge>
          <Badge variant="outline">RFB 5 ALIGNMENT</Badge>
          <Badge variant="outline">ARC TESTNET · USDC</Badge>
        </div>
        <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl md:text-6xl">
          Risk-aware business decisions before an agent moves USDC.
        </h1>
        <p className="mt-5 max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg">
          Geomacro evaluates signed country or corridor risk, applies bounded spending policy, escalates when human approval is required, then verifies the exact Arc Testnet payment against the stored intent.
        </p>
        <p className="mt-4 max-w-3xl text-sm leading-6 text-muted-foreground">
          The underlying Risk Gate always keeps execution_authorized=false. Tameion Agent Mode is a separate testnet business-policy layer. Geomacro never holds a wallet private key or signs a payment transaction.
        </p>
      </section>

      <section className="mt-10 grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
        <div className="rounded-2xl border border-border/70 bg-card/45 p-5 sm:p-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">1 · Payment intent</p>
          <div className="mt-5 grid gap-4">
            <Field label="Country / corridor">
              <select className={inputClass} value={scenario} onChange={(event) => setScenario(event.target.value)}>
                <option value="USA>CHN">United States → China</option>
                <option value="CHN>USA">China → United States</option>
                <option value="USA">United States</option>
                <option value="CHN">China</option>
              </select>
            </Field>
            <Field label="Business policy">
              <select className={inputClass} value={policy} onChange={(event) => setPolicy(event.target.value)}>
                <option value="balanced">Balanced</option>
                <option value="cautious">Cautious</option>
                <option value="strict">Strict</option>
              </select>
            </Field>
            <Field label="Action">
              <select className={inputClass} value={actionType} onChange={(event) => setActionType(event.target.value)}>
                <option value="agent_payment">Agent payment</option>
                <option value="vendor_payment">Vendor payment</option>
                <option value="treasury_payment">Treasury payment</option>
              </select>
            </Field>
            <Field label="Amount (Arc Testnet USDC)">
              <input className={inputClass} inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, "").slice(0, 24))} />
            </Field>
            <Field label="Recipient">
              <input className={`${inputClass} font-mono text-xs`} value={recipient} onChange={(event) => setRecipient(event.target.value.trim().slice(0, 42))} />
            </Field>
            <Button className="mt-1 h-11 gap-2" disabled={busy !== null || !amount || recipient.length !== 42} onClick={() => void runDecision()}>
              {busy === "decision" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              {busy === "decision" ? "Evaluating" : "Run agent decision"}
            </Button>
          </div>
        </div>

        <div className="min-h-[520px] rounded-2xl border border-border/70 bg-card/45 p-5 sm:p-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">2 · Decision and execution</p>
          {error ? (
            <div className="mt-5 rounded-xl border border-destructive/35 bg-destructive/5 p-4">
              <div className="flex items-center gap-2 font-medium text-destructive"><ShieldAlert className="h-4 w-4" /> Flow stopped safely</div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{error}</p>
            </div>
          ) : null}

          {!decision ? (
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {[
                ["Signed risk", "Canonical country or corridor Risk Object evaluated through Geomacro Risk Gate."],
                ["Bounded policy", "Auto-execute and human-approval USDC caps are explicit and inspectable."],
                ["Human escalation", "A wallet signature approves one exact amount, recipient, decision and expiry."],
                ["Verified payment", "Server verifies recipient, native-USDC value and successful Arc Testnet receipt."],
              ].map(([title, body]) => (
                <div key={title} className="rounded-xl border border-border/60 bg-background/25 p-4">
                  <p className="text-sm font-medium">{title}</p>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">{body}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-5 space-y-5">
              <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-start">
                <div>
                  <p className="text-xs text-muted-foreground">Agent decision</p>
                  <p className="mt-1 text-3xl font-semibold tracking-tight">{decision.agent_decision.action.replaceAll("_", " ")}</p>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">{decision.agent_decision.reason_codes.join(" · ")}</p>
                </div>
                <Badge variant="outline">{decision.status.replaceAll("_", " ")}</Badge>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Metric label="Risk" value={`${decision.risk_gate.risk.score.toFixed(1)} · ${decision.risk_gate.risk.label}`} />
                <Metric label="Risk Gate" value={decision.risk_gate.decision.replaceAll("_", " ")} />
                <Metric label="Auto cap" value={`${decision.agent_decision.policy.auto_execute_max_usdc} USDC`} />
                <Metric label="Approval cap" value={`${decision.agent_decision.policy.human_approval_max_usdc} USDC`} />
              </div>

              <div className="rounded-xl border border-border/60 bg-background/25 p-4">
                <KeyValue label="Audit ID" value={decision.audit_id} mono />
                <KeyValue label="Risk object" value={decision.risk_gate.risk.object_id} mono />
                <KeyValue label="Recipient" value={decision.action_context.recipient} mono />
                <KeyValue label="Amount" value={`${decision.action_context.amount_usdc} USDC`} />
                <KeyValue label="Risk Gate boundary" value="execution_authorized = false" mono />
              </div>

              {decision.agent_decision.action === "BLOCK" ? (
                <div className="rounded-xl border border-destructive/35 bg-destructive/5 p-4">
                  <p className="font-medium">Payment blocked by policy.</p>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">No wallet transaction action is exposed for this decision.</p>
                </div>
              ) : null}

              {decision.human_approval.required && !approved ? (
                <Button variant="outline" className="h-11 w-full gap-2" disabled={busy !== null} onClick={() => void approveDecision()}>
                  {busy === "approval" ? <Loader2 className="h-4 w-4 animate-spin" /> : <WalletCards className="h-4 w-4" />}
                  {busy === "approval" ? "Signing approval" : "Sign human approval"}
                </Button>
              ) : null}

              {approved ? (
                <div className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-primary" /> Exact payment intent approved by wallet signature.
                </div>
              ) : null}

              {paymentAllowed && !confirmed ? (
                <Button className="h-11 w-full gap-2" disabled={busy !== null} onClick={() => void executePayment()}>
                  {busy === "payment" ? <Loader2 className="h-4 w-4 animate-spin" /> : <WalletCards className="h-4 w-4" />}
                  {busy === "payment" ? "Paying and verifying" : `Execute ${decision.payment_intent?.amount_usdc} Testnet USDC`}
                </Button>
              ) : null}

              {confirmed ? (
                <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
                  <div className="flex items-center gap-2 font-medium"><CheckCircle2 className="h-4 w-4 text-primary" /> Arc Testnet payment verified</div>
                  <p className="mt-2 font-mono text-xs text-muted-foreground">{confirmed.tx_hash}</p>
                  <a className="mt-3 inline-flex items-center gap-1 text-sm text-primary hover:underline" href={confirmed.explorer_url} target="_blank" rel="noreferrer">
                    View transaction <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-3">
        <InfoCard title="Risk intelligence">Signed Geomacro Risk Object + Risk Gate policy evaluation. No stale or unverifiable object becomes an approval.</InfoCard>
        <InfoCard title="Business policy">Risk result and amount are converted into AUTO_EXECUTE, REQUIRE_APPROVAL or BLOCK with explicit spending caps.</InfoCard>
        <InfoCard title="Payment audit">Every decision is private-server logged. The submitted tx hash must match recipient and amount on Arc Testnet before it becomes EXECUTED.</InfoCard>
      </section>

      <div className="mt-8 flex flex-wrap gap-3 text-sm">
        <Link className="text-primary hover:underline" to="/demo">Open existing Circle x402 Risk Demo</Link>
        <a className="inline-flex items-center gap-1 text-primary hover:underline" href="https://testnet.arcscan.app" target="_blank" rel="noreferrer">Arc Testnet Explorer <ExternalLink className="h-3.5 w-3.5" /></a>
      </div>
    </main>
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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/25 p-3">
      <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}

function KeyValue({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="mt-2 grid gap-1 sm:grid-cols-[120px_1fr] sm:gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`break-all text-xs ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/35 p-4">
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{children}</p>
    </div>
  );
}
