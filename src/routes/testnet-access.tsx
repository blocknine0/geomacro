import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";

import { TESTNET_PUBLIC_API_KEYS } from "@/lib/testnet-public-access-contract";

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
  shown_once?: boolean;
};

type DeveloperCredential = {
  credential_id: string;
  key_id: string | null;
  label: string;
  integration_type: string;
  enabled: boolean;
  expires_at?: string | null;
  last_used_at?: string | null;
  created_at?: string | null;
  revoked_at?: string | null;
};

type EthereumProvider = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
};

const AUTH_FLOW = "client-wallet-first-v4-public-developer";
const MAX_ACTIVE_DEVELOPER_KEYS = 3;

export const Route = createFileRoute("/testnet-access")({
  head: () => ({
    meta: [
      { title: "Geomacro Testnet Access" },
      {
        name: "description",
        content:
          "Sign in with one EVM wallet to test Geomacro on Testnet. Browser testers do not need developer credentials; API keys are optional for app and agent integrations.",
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

function integrationLabel(value: string) {
  const labels: Record<string, string> = {
    product_api: "Product API",
    ai_agent: "AI agent",
    automation: "Automation",
    demo: "Demo",
  };
  return labels[value] || value.replaceAll("_", " ");
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
    TESTNET_DEVELOPER_KEY_LIMIT_REACHED: "You already have the maximum 3 active developer API keys. Revoke one below before creating another.",
    TESTNET_DEVELOPER_KEY_NOT_FOUND: "That developer API key could not be found.",
    INVALID_WALLET_ADDRESS: "The connected wallet address is invalid.",
  };
  return map[code] || code || "Request failed.";
}

function TestnetAccessPage() {
  const [account, setAccount] = useState<AccountState | null>(null);
  const [developerKeys, setDeveloperKeys] = useState<DeveloperCredential[]>([]);
  const [loadingAccount, setLoadingAccount] = useState(true);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [label, setLabel] = useState("Default test integration");
  const [integrationType, setIntegrationType] = useState("product_api");
  const [issued, setIssued] = useState<IssuedCredential | null>(null);
  const [secretCopied, setSecretCopied] = useState(false);

  const active = account?.access_status === "active" && account?.wallet_verified === true;
  const activeDeveloperKeys = useMemo(
    () => developerKeys.filter((key) => key.enabled && !key.revoked_at),
    [developerKeys],
  );
  const selectedIntegrationKeys = useMemo(
    () => activeDeveloperKeys.filter((key) => key.integration_type === integrationType),
    [activeDeveloperKeys, integrationType],
  );
  const developerKeyLimitReached = activeDeveloperKeys.length >= MAX_ACTIVE_DEVELOPER_KEYS;

  const loadDeveloperKeys = useCallback(async () => {
    try {
      const result = await api<{ ok: true; data: DeveloperCredential[] }>("/api/testnet-tester/developer-keys");
      setDeveloperKeys(Array.isArray(result.data) ? result.data : []);
    } catch (error) {
      if ((error as Error & { status?: number }).status === 401) setDeveloperKeys([]);
      else setStatus(friendlyError(error));
    }
  }, []);

  const loadAccount = useCallback(async () => {
    try {
      const result = await api<{ ok: true; data: AccountState }>("/api/testnet-tester/me");
      setAccount(result.data);
      if (result.data.profile_name) setDisplayName(result.data.profile_name);
      if (result.data.access_status === "active" && result.data.wallet_verified === true) {
        await loadDeveloperKeys();
      } else {
        setDeveloperKeys([]);
      }
    } catch (error) {
      if ((error as Error & { status?: number }).status === 401) {
        setAccount(null);
        setDeveloperKeys([]);
      } else {
        setStatus(friendlyError(error));
      }
    } finally {
      setLoadingAccount(false);
    }
  }, [loadDeveloperKeys]);

  useEffect(() => {
    void loadAccount();
  }, [loadAccount]);

  const accountSummary = useMemo(() => {
    if (!account) return "No active tester session";
    if (active) return "Wallet verified · Testnet access active";
    return "Wallet sign-in required to resume or activate Testnet access";
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
    setSecretCopied(false);
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

      setStatus("Verifying wallet and resuming Testnet access...");
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
        ? "Wallet verified. Testnet account created."
        : "Wallet verified. Existing Testnet account resumed.");
      await loadAccount();
    } catch (error) {
      setStatus(friendlyError(error));
    } finally {
      setBusy(false);
    }
  }

  async function disconnectWallet() {
    if (busy) return;
    setBusy(true);
    try {
      await api<{ ok: true; data: { logged_out: boolean } }>("/api/testnet-tester/logout", { method: "POST" });
      const provider = ethereumProvider();
      if (provider) {
        try {
          await provider.request({
            method: "wallet_revokePermissions",
            params: [{ eth_accounts: {} }],
          });
        } catch {
          // Not every injected wallet implements permission revocation.
        }
      }
      setAccount(null);
      setDeveloperKeys([]);
      setIssued(null);
      setSecretCopied(false);
      setStatus("Signed out. Wallet permissions were also revoked where the wallet supports it.");
    } catch (error) {
      setStatus(friendlyError(error));
    } finally {
      setBusy(false);
    }
  }

  async function createCredential(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !active || developerKeyLimitReached) return;
    setBusy(true);
    setIssued(null);
    setSecretCopied(false);
    try {
      const result = await api<{ ok: true; data: IssuedCredential }>("/api/testnet-tester/developer-key", {
        method: "POST",
        body: JSON.stringify({ label, integration_type: integrationType }),
      });
      setIssued(result.data);
      setStatus("Developer credentials created. Copy the API Secret now. It will not be shown again.");
      await loadDeveloperKeys();
    } catch (error) {
      setStatus(friendlyError(error));
      await loadDeveloperKeys();
    } finally {
      setBusy(false);
    }
  }

  async function revokeCredential(credentialId: string) {
    if (busy) return;
    setBusy(true);
    try {
      await api<{ ok: true }>("/api/testnet-tester/developer-key-revoke", {
        method: "POST",
        body: JSON.stringify({ credential_id: credentialId }),
      });
      setStatus("Developer API key revoked.");
      await loadDeveloperKeys();
    } catch (error) {
      setStatus(friendlyError(error));
    } finally {
      setBusy(false);
    }
  }

  async function copyText(value: string, message: string) {
    await navigator.clipboard.writeText(value);
    setStatus(message);
  }

  async function copyIssuedCredentials() {
    if (!issued) return;
    await navigator.clipboard.writeText(`API Key: ${issued.api_key}\nAPI Secret: ${issued.api_secret}`);
    setSecretCopied(true);
    setStatus("API Key + API Secret copied. Store the secret securely; it cannot be recovered later.");
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14" data-testnet-auth-flow={AUTH_FLOW}>
      <section className="rounded-2xl border border-border/70 bg-card/30 p-6 sm:p-8">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">Geomacro Testnet Access</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-border/70 px-3 py-1 font-mono text-[10px] text-muted-foreground">WALLET-FIRST</span>
          <span className="rounded-full border border-border/70 px-3 py-1 font-mono text-[10px] text-muted-foreground">PUBLIC TESTER + DEVELOPER API</span>
          <span className="rounded-full border border-border/70 px-3 py-1 font-mono text-[10px] text-muted-foreground">TESTNET · NON-REVENUE</span>
        </div>
        <h1 className="mt-5 max-w-4xl text-4xl font-semibold tracking-tight sm:text-5xl">Test Geomacro without forcing every tester to become a developer.</h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground">
          Sign one wallet message. Browser testers can use the public Testnet console directly. Developers can optionally create private API credentials for their own apps, agents and automations.
        </p>
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-3">
        {[
          ["01", "Sign in with wallet", "One-time message signature. No blockchain transaction."],
          ["02", "Public Testnet access", "No developer API key required. Choose Arc Testnet, Base Sepolia or Polygon Amoy and pay only per intelligence call."],
          ["03", "Developer integrations (optional)", "Create private API Key + API Secret only when integrating an app, agent or automation."],
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
            <h2 className="mt-2 text-2xl font-semibold">{account?.profile_name || "Testnet user"}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{loadingAccount ? "Checking current session..." : accountSummary}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full border border-border/70 px-3 py-1.5">Wallet: {account?.wallet_verified ? "Verified" : "Sign-in required"}</span>
            <span className="rounded-full border border-border/70 px-3 py-1.5">Access: {account?.access_status || "not active"}</span>
            {active ? (
              <button type="button" onClick={() => void disconnectWallet()} disabled={busy} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50">
                Disconnect wallet
              </button>
            ) : null}
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
            <button type="button" onClick={() => void signIn()} disabled={busy} className="mt-4 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
              {busy ? "Working..." : "Sign in with wallet"}
            </button>
          </div>
        )}

        {status && <div className="mt-4 rounded-lg border border-border/70 bg-background/60 p-3 text-sm text-muted-foreground">{status}</div>}
      </section>

      <section className="mt-6 rounded-2xl border border-border/70 bg-card/30 p-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Public Testnet access</p>
        <h2 className="mt-2 text-2xl font-semibold">Three public API keys, one for each supported Testnet</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          These keys are intentionally public client identifiers, not secrets. They do not bypass wallet sign-in, quotas, HTTP 402 payment, exact-request binding or server-side verification.
        </p>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {Object.values(TESTNET_PUBLIC_API_KEYS).map((entry) => (
            <article key={entry.chain_key} className="rounded-xl border border-border/70 bg-background/50 p-4">
              <p className="text-sm font-medium">{entry.label}</p>
              <code className="mt-2 block break-all text-xs text-muted-foreground">{entry.public_api_key}</code>
              <button type="button" onClick={() => void copyText(entry.public_api_key, `${entry.label} public API key copied.`)} className="mt-3 rounded-lg border border-border px-3 py-2 text-xs">
                Copy public key
              </button>
            </article>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          {active ? (
            <a href="/testnet-console" className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">Open Public Testnet Console</a>
          ) : (
            <span className="text-sm text-muted-foreground">Sign in with a wallet first to use the public Testnet console.</span>
          )}
          <span className="text-xs text-muted-foreground">No developer API key required for browser testing.</span>
        </div>
      </section>

      {active && (
        <section className="mt-6 rounded-2xl border border-border/70 bg-card/30 p-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Developer integrations (optional)</p>
          <h2 className="mt-2 text-2xl font-semibold">Private API Key + API Secret</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            Create these only for your own product, AI agent, automation or demo integration. API Keys remain visible in your account. The API Secret is shown only once when created and cannot be recovered later.
          </p>

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
              <p className="mt-2 text-xs text-muted-foreground">
                {selectedIntegrationKeys.length > 0
                  ? `${selectedIntegrationKeys.length} active ${integrationLabel(integrationType)} key${selectedIntegrationKeys.length === 1 ? "" : "s"} already saved below.`
                  : `No active ${integrationLabel(integrationType)} key yet.`}
              </p>
            </div>
            <div className="md:col-span-2">
              <button disabled={busy || developerKeyLimitReached} className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
                Create Testnet API credentials
              </button>
              {developerKeyLimitReached ? (
                <p className="mt-2 text-xs text-muted-foreground">Maximum 3 active developer keys reached. Revoke one below before creating another.</p>
              ) : null}
            </div>
          </form>

          {issued && (
            <div className="mt-5 rounded-xl border border-primary/40 bg-primary/5 p-4">
              <p className="font-semibold">API Secret is shown only once</p>
              <p className="mt-1 text-sm text-muted-foreground">Copy and store it now. It cannot be recovered later. The API Key will remain visible in your account.</p>
              <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-background p-3 text-xs">API Key: {issued.api_key}{"\n"}API Secret: {issued.api_secret}</pre>
              <div className="mt-3 flex flex-wrap gap-3">
                <button type="button" onClick={() => void copyIssuedCredentials()} className="rounded-lg border border-border px-3 py-2 text-sm">Copy API Key + API Secret</button>
                <a href="/testnet-console" className="rounded-lg border border-border px-3 py-2 text-sm">Open Public Testnet Console</a>
              </div>
              {secretCopied ? <p className="mt-2 text-xs text-muted-foreground">Copied. Store the secret securely before leaving this page.</p> : null}
            </div>
          )}

          <div className="mt-7">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="font-medium">Your developer API keys</p>
                <p className="mt-1 text-xs text-muted-foreground">API Keys stay visible. API Secrets are never returned again after creation.</p>
              </div>
              <span className="text-xs text-muted-foreground">{activeDeveloperKeys.length}/{MAX_ACTIVE_DEVELOPER_KEYS} active</span>
            </div>

            {developerKeys.length === 0 ? (
              <div className="mt-3 rounded-lg border border-border/70 bg-background/50 p-4 text-sm text-muted-foreground">No developer keys created yet.</div>
            ) : (
              <div className="mt-3 space-y-3">
                {developerKeys.map((key) => (
                  <article key={key.credential_id} className="rounded-xl border border-border/70 bg-background/50 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{key.label}</p>
                          <span className="rounded-full border border-border/70 px-2 py-0.5 text-[10px] text-muted-foreground">{integrationLabel(key.integration_type)}</span>
                          <span className="rounded-full border border-border/70 px-2 py-0.5 text-[10px] text-muted-foreground">{key.enabled && !key.revoked_at ? "Active" : "Revoked"}</span>
                        </div>
                        <code className="mt-2 block break-all text-xs text-muted-foreground">API Key: {key.key_id || "Unavailable"}</code>
                        <p className="mt-1 text-xs text-muted-foreground">Secret: hidden permanently after creation</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {key.key_id ? (
                          <button type="button" onClick={() => void copyText(key.key_id || "", "API Key copied.")} className="rounded-lg border border-border px-3 py-2 text-xs">Copy API Key</button>
                        ) : null}
                        {key.enabled && !key.revoked_at ? (
                          <button type="button" onClick={() => void revokeCredential(key.credential_id)} disabled={busy} className="rounded-lg border border-border px-3 py-2 text-xs text-destructive disabled:opacity-50">Revoke</button>
                        ) : null}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      <section className="mt-6 rounded-2xl border border-border/70 bg-card/20 p-5 text-sm text-muted-foreground">
        <p><span className="font-medium text-foreground">Public browser flow:</span> wallet session + network-specific public API key → HTTP 402 quote → one Testnet USDC payment → retry the exact same request_id with proof → intelligence result.</p>
        <p className="mt-2"><span className="font-medium text-foreground">Developer flow:</span> private API Key + one-time API Secret → HTTP 402 → payment proof → machine-readable response.</p>
        <p className="mt-2">Supported Testnets: Arc Testnet, Base Sepolia and Polygon Amoy. Testnet only. Non-revenue. `execution_authorized=false` for Risk Gate outputs.</p>
      </section>
    </main>
  );
}
