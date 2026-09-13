import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";

type AccountState = {
  profile_name?: string;
  wallet_verified?: boolean;
  access_status?: string;
  registration_status?: string;
};

type IssuedCredential = {
  api_key: string;
  api_secret: string;
  expires_at?: string;
};

type EthereumProvider = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
};

const AUTH_FLOW = "client-wallet-first-v3";

export const Route = createFileRoute("/testnet-access")({
  head: () => ({
    meta: [
      { title: "Geomacro Testnet Developer Access" },
      {
        name: "description",
        content:
          "Sign in with one EVM wallet, create Testnet API credentials and test Geomacro pay-per-call intelligence with Testnet USDC.",
      },
      { name: "geomacro-testnet-auth-flow", content: AUTH_FLOW },
    ],
    links: [{ rel: "canonical", href: "https://geomacro.live/testnet-access" }],
  }),
  component: TestnetAccessPage,
});

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: {
      accept: "application/json",
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...(init?.headers || {}),
    },
    ...init,
  });
  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok || !payload || payload.ok === false) {
    const nested = payload && typeof payload.error === "object" ? payload.error as Record<string, unknown> : null;
    const message = firstString(
      payload?.statusMessage,
      payload?.message,
      payload?.error,
      nested?.code,
      nested?.message,
      response.statusText,
    );
    const error = new Error(message || `Request failed (${response.status})`);
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
  return payload as T;
}

function ethereumProvider(): EthereumProvider | null {
  if (typeof window === "undefined") return null;
  const provider = (window as Window & { ethereum?: EthereumProvider }).ethereum;
  return provider?.request ? provider : null;
}

function utf8ToHex(value: string) {
  const bytes = new TextEncoder().encode(value);
  return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

async function personalSign(provider: EthereumProvider, message: string, address: string) {
  const encoded = utf8ToHex(message);
  try {
    return String(await provider.request({ method: "personal_sign", params: [encoded, address] }));
  } catch (error) {
    const code = (error as { code?: number })?.code;
    if (code === 4001) throw error;
    const detail = firstString((error as { message?: string })?.message);
    if (!/param|argument|address|data|invalid/i.test(detail)) throw error;
    return String(await provider.request({ method: "personal_sign", params: [address, encoded] }));
  }
}

function parseChainId(value: unknown) {
  const raw = String(value ?? "").trim();
  const parsed = /^0x[0-9a-f]+$/i.test(raw) ? Number.parseInt(raw, 16) : Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error("TESTNET_SIGNIN_CHAIN_INVALID");
  return parsed;
}

function friendlyError(error: unknown) {
  if ((error as { code?: number })?.code === 4001) return "Wallet request was cancelled.";
  const code = firstString((error as { message?: string })?.message);
  const map: Record<string, string> = {
    TESTNET_SIGNIN_CHAIN_INVALID: "The wallet returned an invalid EVM chain ID.",
    TESTNET_SIGNIN_CHALLENGE_EXPIRED: "The sign-in request expired. Try again.",
    TESTNET_SIGNIN_CHALLENGE_USED_OR_EXPIRED: "That sign-in request was already used or expired. Try again.",
    TESTNET_SIGNIN_MESSAGE_MISMATCH: "The wallet sign-in message did not match the server challenge.",
    TESTNET_WALLET_SIGNATURE_INVALID: "The wallet signature could not be verified.",
    TESTNET_PROFILE_NOT_ACTIVE: "This Testnet account is not active.",
    INVALID_WALLET_ADDRESS: "The connected wallet address is invalid.",
  };
  return map[code] || code || "Request failed.";
}

function TestnetAccessPage() {
  const [account, setAccount] = useState<AccountState | null>(null);
  const [loadingAccount, setLoadingAccount] = useState(true);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [label, setLabel] = useState("Default test integration");
  const [integrationType, setIntegrationType] = useState("product_api");
  const [issued, setIssued] = useState<IssuedCredential | null>(null);

  const active = account?.access_status === "active" && account?.wallet_verified === true;

  const loadAccount = useCallback(async () => {
    try {
      const result = await api<{ ok: true; data: AccountState }>("/api/testnet-tester/me");
      setAccount(result.data);
      if (result.data.profile_name) setDisplayName(result.data.profile_name);
    } catch (error) {
      if ((error as Error & { status?: number }).status === 401) {
        setAccount(null);
      } else {
        setStatus(friendlyError(error));
      }
    } finally {
      setLoadingAccount(false);
    }
  }, []);

  useEffect(() => {
    void loadAccount();
  }, [loadAccount]);

  const accountSummary = useMemo(() => {
    if (!account) return "No active tester session";
    if (active) return "Wallet verified · developer access active";
    return "Wallet sign-in required to resume or activate developer access";
  }, [account, active]);

  async function signIn() {
    if (busy) return;
    const provider = ethereumProvider();
    if (!provider) {
      setStatus("No EVM wallet detected. Enable Rabby, MetaMask or another injected wallet and reload.");
      return;
    }

    setBusy(true);
    setIssued(null);
    try {
      setStatus("Opening wallet...");
      const accounts = await provider.request({ method: "eth_requestAccounts" }) as string[];
      const walletAddress = String(accounts?.[0] || "").trim();
      if (!/^0x[0-9a-fA-F]{40}$/.test(walletAddress)) throw new Error("INVALID_WALLET_ADDRESS");
      const chainId = parseChainId(await provider.request({ method: "eth_chainId" }));

      setStatus("Preparing one-time wallet sign-in...");
      const challenge = await api<{
        ok: true;
        data: { message: string; nonce: string; issued_at: number; chain_id: number };
      }>("/api/testnet-tester/auth-challenge", {
        method: "POST",
        body: JSON.stringify({ wallet_address: walletAddress, chain_id: chainId }),
      });

      setStatus("Approve the wallet message. This is not a transaction and cannot move funds.");
      const signature = await personalSign(provider, challenge.data.message, walletAddress);

      setStatus("Verifying wallet and resuming developer access...");
      const verified = await api<{
        ok: true;
        data: { account_created?: boolean; access_status?: string };
      }>("/api/testnet-tester/auth-verify", {
        method: "POST",
        body: JSON.stringify({
          wallet_address: walletAddress,
          chain_id: challenge.data.chain_id,
          nonce: challenge.data.nonce,
          issued_at: challenge.data.issued_at,
          message: challenge.data.message,
          signature,
          profile_name: displayName.trim() || undefined,
        }),
      });

      setStatus(verified.data.account_created
        ? "Wallet verified. Developer account created."
        : "Wallet verified. Existing developer account resumed.");
      await loadAccount();
    } catch (error) {
      setStatus(friendlyError(error));
    } finally {
      setBusy(false);
    }
  }

  async function createCredential(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !active) return;
    setBusy(true);
    setIssued(null);
    try {
      const result = await api<{ ok: true; data: IssuedCredential }>("/api/testnet-tester/developer-key", {
        method: "POST",
        body: JSON.stringify({ label, integration_type: integrationType }),
      });
      setIssued(result.data);
      setStatus("API credentials created. Copy both values now. The secret is shown once.");
    } catch (error) {
      setStatus(friendlyError(error));
    } finally {
      setBusy(false);
    }
  }

  async function copyCredentials() {
    if (!issued) return;
    await navigator.clipboard.writeText(`API Key: ${issued.api_key}\nAPI Secret: ${issued.api_secret}`);
    setStatus("API Key + Secret copied.");
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14" data-testnet-auth-flow={AUTH_FLOW}>
      <section className="rounded-2xl border border-border/70 bg-card/30 p-6 sm:p-8">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">Hidden Testnet Developer Access</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-border/70 px-3 py-1 font-mono text-[10px] text-muted-foreground">CLIENT WALLET-FIRST V3</span>
          <span className="rounded-full border border-border/70 px-3 py-1 font-mono text-[10px] text-muted-foreground">TESTNET · NON-REVENUE</span>
        </div>
        <h1 className="mt-5 max-w-4xl text-4xl font-semibold tracking-tight sm:text-5xl">Wallet-first developer access for Geomacro Testnet.</h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground">
          Sign one message with an EVM wallet. Existing wallets resume the same developer account. New wallets create one only after signature verification. No seed phrase, private key or upfront payment is required.
        </p>
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-3">
        {[
          ["01", "Sign in with wallet", "One-time message signature. No blockchain transaction."],
          ["02", "Create API credentials", "Generate an API Key + API Secret after access becomes active."],
          ["03", "Pay only per API call", "Receive HTTP 402, pay Testnet USDC, then retry the exact request with proof."],
        ].map(([n, title, copy]) => (
          <article key={n} className="rounded-2xl border border-border/70 bg-card/30 p-5">
            <span className="font-mono text-[10px] text-primary">{n}</span>
            <h2 className="mt-2 text-lg font-medium">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{copy}</p>
          </article>
        ))}
      </section>

      <section className="mt-6 rounded-2xl border border-border/70 bg-card/30 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Wallet account</p>
            <h2 className="mt-2 text-2xl font-semibold">{account?.profile_name || "Testnet developer"}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{loadingAccount ? "Checking current session..." : accountSummary}</p>
          </div>
          <div className="flex gap-2 text-xs">
            <span className="rounded-full border border-border/70 px-3 py-1.5">Wallet: {account?.wallet_verified ? "Verified" : "Sign-in required"}</span>
            <span className="rounded-full border border-border/70 px-3 py-1.5">Access: {account?.access_status || "not active"}</span>
          </div>
        </div>

        {!active && (
          <div className="mt-6 max-w-xl">
            <label className="text-xs text-muted-foreground" htmlFor="testnetDisplayName">Display name (optional for a new wallet)</label>
            <input
              id="testnetDisplayName"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              maxLength={64}
              className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary/60"
              placeholder="Optional display name"
            />
            <button
              type="button"
              onClick={() => void signIn()}
              disabled={busy}
              className="mt-4 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {busy ? "Working..." : "Sign in with wallet"}
            </button>
          </div>
        )}

        {status && <div className="mt-4 rounded-lg border border-border/70 bg-background/60 p-3 text-sm text-muted-foreground">{status}</div>}
      </section>

      {active && (
        <section className="mt-6 rounded-2xl border border-border/70 bg-card/30 p-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Developer API</p>
          <h2 className="mt-2 text-2xl font-semibold">Create API Key + API Secret</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">The secret is shown once. Testnet usage is capped at 500 credits per 30 days. One credit costs 0.5 Testnet USDC when consumed.</p>

          <form onSubmit={createCredential} className="mt-5 grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-xs text-muted-foreground" htmlFor="credentialLabel">Credential label</label>
              <input id="credentialLabel" value={label} onChange={(event) => setLabel(event.target.value)} maxLength={80} className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground" htmlFor="integrationType">Integration type</label>
              <select id="integrationType" value={integrationType} onChange={(event) => setIntegrationType(event.target.value)} className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm">
                <option value="product_api">Product API</option>
                <option value="ai_agent">AI agent</option>
                <option value="automation">Automation</option>
                <option value="demo">Demo</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <button disabled={busy} className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">Create Testnet API credentials</button>
            </div>
          </form>

          {issued && (
            <div className="mt-5 rounded-xl border border-primary/30 bg-primary/5 p-4">
              <p className="font-medium">Copy both values now</p>
              <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-background p-3 text-xs">API Key: {issued.api_key}{"\n"}API Secret: {issued.api_secret}</pre>
              <div className="mt-3 flex flex-wrap gap-3">
                <button type="button" onClick={() => void copyCredentials()} className="rounded-lg border border-border px-3 py-2 text-sm">Copy API Key + Secret</button>
                <a href="/testnet-console" className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground">Open Testnet Console</a>
              </div>
            </div>
          )}
        </section>
      )}

      <section className="mt-6 rounded-2xl border border-border/70 bg-card/20 p-5 text-sm text-muted-foreground">
        <p><span className="font-medium text-foreground">API flow:</span> API Key + Secret → HTTP 402 quote → one Testnet USDC payment → retry the exact same request_id with payment proof → intelligence result.</p>
        <p className="mt-2">Supported Testnets: Arc Testnet, Base Sepolia and Polygon Amoy. Testnet only. Non-revenue. `execution_authorized=false` for Risk Gate outputs.</p>
      </section>
    </main>
  );
}
