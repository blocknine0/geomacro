import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";

import { TESTNET_INTELLIGENCE_CAPABILITIES, TESTNET_INTELLIGENCE_PRICE_TABLE } from "@/lib/testnet-intelligence-contract";
import { TESTNET_API_CREDIT_PRICE_USDC, TESTNET_API_FIXED_CREDITS } from "@/lib/testnet-api-pricing";
import { TESTNET_PUBLIC_API_KEYS } from "@/lib/testnet-public-access-contract";
import { TESTNET_USDC_ACCESS_CHAINS } from "@/lib/testnet-usdc-access-contract";

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
  scopes?: string[];
};

type EthereumProvider = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: "accountsChanged", listener: (accounts: string[]) => void): void;
  removeListener?(event: "accountsChanged", listener: (accounts: string[]) => void): void;
};

type FollowState = "idle" | "opened" | "confirmed";

const AUTH_FLOW = "client-wallet-first-v4-public-developer";
const MAX_ACTIVE_DEVELOPER_KEYS = 1;
const DEMO_CAPABILITY = "structural_country_digest" as const;
const DEMO_PRICE = TESTNET_INTELLIGENCE_PRICE_TABLE[DEMO_CAPABILITY];
const TESTNET_INTELLIGENCE_CAPABILITY_COUNT = TESTNET_INTELLIGENCE_CAPABILITIES.length;
const TESTNET_USDC_CHAIN_COUNT = Object.values(TESTNET_USDC_ACCESS_CHAINS).length;
const X_HANDLE = "GeomacroLive";
const X_FOLLOW_URL = `https://x.com/intent/follow?screen_name=${X_HANDLE}`;
const X_SHARE_TEXT =
  "I tested @GeomacroLive Testnet risk intelligence. My feedback: [add your feedback here]";
const X_SHARE_URL =
  `https://x.com/intent/post?text=${encodeURIComponent(X_SHARE_TEXT)}&url=${encodeURIComponent("https://geomacro.live/testnet-access")}`;

export const Route = createFileRoute("/testnet-access")({
  head: () => ({
    meta: [
      { title: "Geomacro Testnet Access" },
      {
        name: "description",
        content:
          "Build with Geomacro Testnet: machine-readable geopolitical and macro intelligence, pay-per-call access, API integrations for products and AI agents, and an explicit x402 flow.",
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
    const nested = payload && typeof payload.error === "object"
      ? payload.error as Record<string, unknown>
      : null;
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

function shortAddress(address: string) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return "";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
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
    TESTNET_DEVELOPER_KEY_LIMIT_REACHED:
      "One active developer credential is supported per wallet. Revoke it before creating a replacement.",
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
  const [connectedWallet, setConnectedWallet] = useState("");
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [feedbackStatus, setFeedbackStatus] = useState("");
  const [followState, setFollowState] = useState<FollowState>("idle");
  const [shareOpened, setShareOpened] = useState(false);
  const [demoStep, setDemoStep] = useState(0);
  const [liveManifest, setLiveManifest] = useState<unknown>(null);
  const [manifestBusy, setManifestBusy] = useState(false);

  const active = account?.access_status === "active" && account?.wallet_verified === true;
  const walletConnected = Boolean(connectedWallet) || active;
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

    const provider = ethereumProvider();
    if (!provider) return;

    const syncAccounts = (accounts: string[]) => {
      const address = String(accounts?.[0] || "").trim();
      setConnectedWallet(/^0x[0-9a-fA-F]{40}$/.test(address) ? address : "");
    };

    void provider.request({ method: "eth_accounts" })
      .then((accounts) => syncAccounts(Array.isArray(accounts) ? accounts.map(String) : []))
      .catch(() => {});

    provider.on?.("accountsChanged", syncAccounts);
    return () => provider.removeListener?.("accountsChanged", syncAccounts);
  }, [loadAccount]);

  useEffect(() => {
    try {
      if (window.localStorage.getItem("geomacro_x_follow_confirmed") === "1") {
        setFollowState("confirmed");
      }
    } catch {
      // Local storage is optional.
    }
  }, []);

  const accountSummary = useMemo(() => {
    if (active) return "Wallet verified · Testnet access active";
    if (connectedWallet) return `Wallet connected · ${shortAddress(connectedWallet)} · Geomacro sign-in required`;
    if (!account) return "No active tester session";
    return "Wallet sign-in required to resume or activate Testnet access";
  }, [account, active, connectedWallet]);

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
      setConnectedWallet(walletAddress);
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

      setStatus(
        verified.data.account_created
          ? "Wallet verified. Testnet account created."
          : "Wallet verified. Existing Testnet account resumed.",
      );
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
    let serverSignedOut = false;
    try {
      try {
        await api<{ ok: true; data: { logged_out: boolean } }>("/api/testnet-tester/logout", { method: "POST" });
        serverSignedOut = true;
      } catch (error) {
        if ((error as Error & { status?: number }).status !== 401) throw error;
        serverSignedOut = true;
      }

      const provider = ethereumProvider();
      let permissionRevoked = false;
      let walletStillConnected = false;
      if (provider) {
        try {
          await provider.request({
            method: "wallet_revokePermissions",
            params: [{ eth_accounts: {} }],
          });
          permissionRevoked = true;
        } catch {
          permissionRevoked = false;
        }

        try {
          const accounts = await provider.request({ method: "eth_accounts" }) as string[];
          const remaining = String(accounts?.[0] || "").trim();
          walletStillConnected = /^0x[0-9a-fA-F]{40}$/.test(remaining);
          setConnectedWallet(walletStillConnected ? remaining : "");
        } catch {
          if (permissionRevoked) setConnectedWallet("");
          else walletStillConnected = Boolean(connectedWallet);
        }
      } else {
        setConnectedWallet("");
      }

      setAccount(null);
      setDeveloperKeys([]);
      setIssued(null);
      setSecretCopied(false);

      if (permissionRevoked && !walletStillConnected) {
        setStatus("Signed out from Geomacro and wallet site permission revoked.");
      } else if (serverSignedOut) {
        setStatus(
          "Signed out from Geomacro. If your wallet still shows this site as connected, use the wallet extension's Disconnect site action.",
        );
      }
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
      setIssued(null);
      setSecretCopied(false);
      setStatus("Developer API key revoked. You can create a new credential now.");
      await loadDeveloperKeys();
    } catch (error) {
      setStatus(friendlyError(error));
    } finally {
      setBusy(false);
    }
  }

  async function rotateCredential(credentialId: string) {
    if (busy) return;
    setBusy(true);
    setIssued(null);
    setSecretCopied(false);
    try {
      const result = await api<{ ok: true; data: IssuedCredential; warning?: string }>(
        "/api/testnet-tester/developer-key-rotate",
        {
          method: "POST",
          body: JSON.stringify({ credential_id: credentialId }),
        },
      );
      setIssued(result.data);
      setStatus(
        "Developer credentials rotated. The previous credential is revoked. Copy the new API Secret now; it will not be shown again.",
      );
      await loadDeveloperKeys();
    } catch (error) {
      setStatus(friendlyError(error));
      await loadDeveloperKeys();
    } finally {
      setBusy(false);
    }
  }

  async function submitFeedback(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (feedbackBusy) return;
    setFeedbackBusy(true);
    setFeedbackStatus("Sending optional feedback...");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      const result = await api<{ ok: true; message?: string }>("/api/demo/feedback", {
        method: "POST",
        body: JSON.stringify({
          demo_mode: "OTHER",
          tester_type: String(form.get("tester_type") || "builder"),
          rating: Number(form.get("rating") || 5),
          would_integrate:
            form.get("would_integrate") === "yes"
              ? true
              : form.get("would_integrate") === "no"
                ? false
                : null,
          outcome: String(form.get("outcome") || "worked"),
          most_valuable: String(form.get("most_valuable") || "").trim(),
          friction: String(form.get("friction") || "").trim(),
          missing_capability: String(form.get("missing_capability") || "").trim(),
        }),
      });
      setFeedbackStatus(result.message || "Feedback saved. Thank you.");
      formElement.reset();
    } catch (error) {
      setFeedbackStatus(friendlyError(error));
    } finally {
      setFeedbackBusy(false);
    }
  }

  async function writeClipboard(value: string) {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(value);
        return;
      } catch {
        // Fall through to the browser-compatible textarea fallback.
      }
    }

    const textArea = document.createElement("textarea");
    textArea.value = value;
    textArea.setAttribute("readonly", "");
    textArea.style.position = "fixed";
    textArea.style.opacity = "0";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    let copied = false;
    try {
      copied = document.execCommand("copy");
    } finally {
      document.body.removeChild(textArea);
    }

    if (!copied) throw new Error("CLIPBOARD_UNAVAILABLE");
  }

  async function copyText(value: string, message: string) {
    try {
      await writeClipboard(value);
      setStatus(message);
    } catch {
      setStatus("Copy is unavailable in this browser. Select the value manually and copy it.");
    }
  }

  async function copyIssuedCredentials() {
    if (!issued) return;
    try {
      await writeClipboard(`API Key: ${issued.api_key}\nAPI Secret: ${issued.api_secret}`);
      setSecretCopied(true);
      setStatus("API Key + API Secret copied. Store the secret securely; it cannot be recovered later.");
    } catch {
      setStatus("Copy is unavailable in this browser. Select the credentials manually and store the API Secret securely.");
    }
  }

  function openFollowIntent() {
    window.open(X_FOLLOW_URL, "_blank", "noopener,noreferrer");
    setFollowState("opened");
  }

  async function loadLiveManifest() {
    if (manifestBusy) return;
    setManifestBusy(true);
    try {
      const result = await api<Record<string, unknown>>("/api/testnet/manifest");
      setLiveManifest(result);
      setStatus("Live Testnet manifest loaded from the production endpoint.");
    } catch (error) {
      setStatus(friendlyError(error));
    } finally {
      setManifestBusy(false);
    }
  }

  function confirmFollow() {
    setFollowState("confirmed");
    try {
      window.localStorage.setItem("geomacro_x_follow_confirmed", "1");
    } catch {
      // Local storage is optional.
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12" data-testnet-auth-flow={AUTH_FLOW}>
      <section className="rounded-3xl border border-border/70 bg-card/30 p-6 sm:p-10">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">TESTNET ACCESS</span>
          <span className="rounded-full border border-border/70 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">machine-readable</span>
          <span className="rounded-full border border-border/70 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">pay per call</span>
          <span className="rounded-full border border-border/70 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">testnet</span>
        </div>
        <h1 className="mt-5 max-w-4xl text-4xl font-semibold tracking-tight sm:text-6xl">Turn geopolitical risk into intelligence your product or AI agent can use.</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">Build on Geomacro's governed intelligence layer. Explore the output, see the x402 payment loop, then connect your own system.</p>
        <div className="mt-7 flex flex-wrap gap-3">
          <a href="#x402-demo" className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">See it work</a>
          <a href="#wallet-account" className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium">Start testing</a>
          <a href="#developer-access" className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium">Build with API</a>
        </div>
        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border/70 bg-background/40 p-4"><p className="text-sm font-semibold">For people</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Research questions, GRI context and change drivers.</p></div>
          <div className="rounded-xl border border-border/70 bg-background/40 p-4"><p className="text-sm font-semibold">For products & agents</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Structured risk, signed Risk Objects and Risk Gate context.</p></div>
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4"><p className="text-sm font-semibold">Testnet now</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Mainnet remains a separate production milestone.</p></div>
        </div>
      </section>

      <section className="mt-6 grid gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border/70 bg-card/20 p-4"><p className="font-mono text-[9px] uppercase tracking-[0.15em] text-muted-foreground">CAPABILITIES</p><p className="mt-2 text-2xl font-semibold">{TESTNET_INTELLIGENCE_CAPABILITY_COUNT}</p></div>
        <div className="rounded-xl border border-border/70 bg-card/20 p-4"><p className="font-mono text-[9px] uppercase tracking-[0.15em] text-muted-foreground">ENTRY PRICE</p><p className="mt-2 text-2xl font-semibold">{TESTNET_API_CREDIT_PRICE_USDC} USDC</p><p className="mt-1 text-[11px] text-muted-foreground">per credit</p></div>
        <div className="rounded-xl border border-border/70 bg-card/20 p-4"><p className="font-mono text-[9px] uppercase tracking-[0.15em] text-muted-foreground">TEST WINDOW</p><p className="mt-2 text-2xl font-semibold">{TESTNET_API_FIXED_CREDITS}</p><p className="mt-1 text-[11px] text-muted-foreground">credits / 30 days</p></div>
        <div className="rounded-xl border border-border/70 bg-card/20 p-4"><p className="font-mono text-[9px] uppercase tracking-[0.15em] text-muted-foreground">PAYMENT NETWORKS</p><p className="mt-2 text-2xl font-semibold">{TESTNET_USDC_CHAIN_COUNT}</p><p className="mt-1 text-[11px] text-muted-foreground">supported Testnets</p></div>
      </section>

      <section className="mt-6 rounded-2xl border border-border/70 bg-card/30 p-6 sm:p-8">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">WHAT YOU CAN BUILD</p>
        <h2 className="mt-2 text-2xl font-semibold">One risk layer. Different ways to use it.</h2>
        <div className="mt-5 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <article className="rounded-xl border border-border/70 bg-background/40 p-4"><p className="font-mono text-[9px] text-muted-foreground">PEOPLE</p><h3 className="mt-2 font-semibold">Research & decisions</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">Ask a risk question, understand change drivers, and use GRI context.</p></article>
          <article className="rounded-xl border border-border/70 bg-background/40 p-4"><p className="font-mono text-[9px] text-muted-foreground">PRODUCTS</p><h3 className="mt-2 font-semibold">Embed structured risk</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">Country, corridor, GRI and signed Risk Object outputs for your workflows.</p></article>
          <article className="rounded-xl border border-border/70 bg-background/40 p-4"><p className="font-mono text-[9px] text-muted-foreground">AI AGENTS</p><h3 className="mt-2 font-semibold">Governed decision context</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">Use <code>risk_gate_bundle</code> when an agent needs risk reasons plus verification.</p></article>
          <article className="rounded-xl border border-border/70 bg-background/40 p-4"><p className="font-mono text-[9px] text-muted-foreground">MACHINES</p><h3 className="mt-2 font-semibold">Discover the contract</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">Start at <code>/api/testnet/manifest</code>, then authenticate and request structured output.</p></article>
        </div>
      </section>

      <section id="x402-demo" className="mt-6 rounded-2xl border border-border/70 bg-card/30 p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">X402 IN ACTION</p><h2 className="mt-2 text-2xl font-semibold">API call → 402 response → pay → retry → response</h2><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Interactive walkthrough of the request-bound payment loop. Demo only, no real payment occurs here.</p></div><span className="rounded-full border border-primary/30 bg-primary/5 px-3 py-1 font-mono text-[9px] text-primary">INTERACTIVE DEMO</span></div>
        <div className="mt-6 grid gap-4 lg:grid-cols-[0.7fr_1.3fr]">
          <div className="grid gap-2 sm:grid-cols-5 lg:grid-cols-1">
            {[["01","API call"],["02","402 response"],["03","Pay"],["04","Retry"],["05","Response"]].map(([number,label], index) => (
              <button key={number} type="button" onClick={() => setDemoStep(index)} className={demoStep === index ? "rounded-xl border border-primary bg-primary/5 px-4 py-3 text-left" : "rounded-xl border border-border/70 bg-background/30 px-4 py-3 text-left"}><span className="font-mono text-[9px] text-muted-foreground">{number}</span><span className="ml-3 text-sm font-medium">{label}</span></button>
            ))}
          </div>
          <div className="rounded-xl border border-border/70 bg-background/70 p-4">
            {demoStep === 0 ? <pre className="overflow-x-auto rounded-lg bg-background p-4 text-[11px] leading-5 text-muted-foreground">{'POST /api/testnet/intelligence\n\nrequest_id: country-demo-0001\ncapability: structural_country_digest\nsubject: country / IND'}</pre> : demoStep === 1 ? <pre className="overflow-x-auto rounded-lg bg-background p-4 text-[11px] leading-5 text-muted-foreground">{'HTTP 402\namount_due_usdc: ' + DEMO_PRICE + '\nrequest_id: country-demo-0001\nreceiver: configured Testnet receiver'}</pre> : demoStep === 2 ? <pre className="overflow-x-auto rounded-lg bg-background p-4 text-[11px] leading-5 text-muted-foreground">{'Testnet USDC payment\nchain: supported Testnet\namount: API quote\ntx: recorded by paying wallet'}</pre> : demoStep === 3 ? <pre className="overflow-x-auto rounded-lg bg-background p-4 text-[11px] leading-5 text-muted-foreground">{'POST /api/testnet/intelligence\nrequest_id: country-demo-0001\npayment: chain_key + tx_hash + payer_address'}</pre> : <pre className="overflow-x-auto rounded-lg bg-background p-4 text-[11px] leading-5 text-muted-foreground">{'status: settled\ncapability: structural_country_digest\ndelivery: structured\nexecution_authorized: false'}</pre>}
            <button type="button" onClick={() => setDemoStep((demoStep + 1) % 5)} className="mt-4 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground">{demoStep === 4 ? "Replay demo" : "Next step"}</button>
          </div>
        </div>
      </section>

      <section id="wallet-account" className="mt-6 rounded-2xl border border-border/70 bg-card/30 p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">GET TESTNET ACCESS</p><h2 className="mt-2 text-2xl font-semibold">Test it in the public console.</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Connect a wallet and sign the one-time access message. No transaction is created by sign-in.</p></div>{walletConnected ? <button type="button" onClick={() => void disconnectWallet()} disabled={busy} className="rounded-lg border border-border px-3 py-2 text-xs font-medium disabled:opacity-50">Disconnect wallet</button> : null}</div>
        <div className="mt-5 rounded-xl border border-border/70 bg-background/40 p-5">
          {loadingAccount ? <p className="text-sm text-muted-foreground">Checking Testnet access…</p> : active ? <div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-sm font-semibold">{accountSummary}</p><p className="mt-1 text-xs text-muted-foreground">{displayName || "Wallet tester"} · {shortAddress(connectedWallet)}</p></div><a href="/testnet-console" className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">Open Public Testnet Console</a></div> : <div><p className="text-sm font-semibold">{accountSummary}</p><div className="mt-4 flex flex-wrap items-center gap-3"><label className="sr-only" htmlFor="testnetDisplayName">Profile name</label><input id="testnetDisplayName" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Optional profile name" maxLength={80} className="w-full max-w-xs rounded-lg border border-border bg-background px-3 py-2.5 text-sm" /><button type="button" onClick={() => void signIn()} disabled={busy} className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy ? "Working…" : "Sign in with wallet"}</button></div></div>}
        </div>
        {status ? <div role="status" aria-live="polite" className="mt-4 rounded-lg border border-border/70 bg-background/60 p-3 text-sm text-muted-foreground">{status}</div> : null}
      </section>

      <section className="mt-6 rounded-2xl border border-border/70 bg-card/30 p-6 sm:p-8">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border/70 bg-background/40 p-4"><p className="text-sm font-semibold">Structured intelligence</p><p className="mt-1 text-xs leading-5 text-muted-foreground">GRI, country and corridor intelligence for machine consumption.</p></div>
          <div className="rounded-xl border border-border/70 bg-background/40 p-4"><p className="text-sm font-semibold">Verification</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Signed Risk Objects and governed Risk Gate context.</p></div>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">Available contract capabilities include <code>signed_risk_object</code> and <code>risk_gate_bundle</code>.</p>
      </section>

      <section id="developer-access" className="mt-6 rounded-2xl border border-border/70 bg-card/30 p-6 sm:p-8">
        <details>
          <summary className="cursor-pointer list-none"><span className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Developer integrations (optional)</span><span className="mt-2 block text-2xl font-semibold">Developers</span><span className="mt-2 block max-w-2xl text-sm leading-6 text-muted-foreground">Create a private API Key + API Secret for your product, AI agent or automation. The secret is shown only once.</span><span className="mt-2 block text-xs text-muted-foreground">{activeDeveloperKeys.length}/{MAX_ACTIVE_DEVELOPER_KEYS} active</span></summary>
          <div className="mt-6 border-t border-border/70 pt-6">
            {!active ? <p className="rounded-xl border border-border/70 bg-background/40 p-4 text-sm text-muted-foreground">Sign in with a wallet above to create or manage developer credentials.</p> : <>
              <form onSubmit={createCredential} className="grid gap-4 sm:grid-cols-2">
                <div><label className="text-xs text-muted-foreground" htmlFor="credentialLabel">Credential label</label><input id="credentialLabel" value={label} onChange={(event) => setLabel(event.target.value)} maxLength={80} className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm" /></div>
                <div><label className="text-xs text-muted-foreground" htmlFor="integrationType">Integration type</label><select id="integrationType" value={integrationType} onChange={(event) => setIntegrationType(event.target.value)} className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"><option value="product_api">Product API</option><option value="ai_agent">AI agent</option><option value="automation">Automation</option><option value="demo">Demo (no Risk Gate)</option></select>
                  <p className="mt-2 text-xs text-muted-foreground">{selectedIntegrationKeys.length > 0 ? selectedIntegrationKeys.length + " active " + integrationLabel(integrationType) + " credential" + (selectedIntegrationKeys.length === 1 ? "" : "s") + " already saved below." : activeDeveloperKeys.length > 0 ? "An active " + integrationLabel(activeDeveloperKeys[0].integration_type) + " credential already exists for this wallet. Revoke it before creating a new " + integrationLabel(integrationType) + " credential." : "No active " + integrationLabel(integrationType) + " credential yet."}</p>
                  <p className="mt-2 text-xs text-muted-foreground">Scopes follow the selected integration type. Demo credentials do not include Risk Gate access.</p>
                </div>
                <div className="sm:col-span-2"><button disabled={busy || developerKeyLimitReached} className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">Create Testnet API credentials</button>{developerKeyLimitReached ? <p className="mt-2 text-xs text-muted-foreground">One active developer credential is supported per wallet. Revoke the existing credential below before creating a replacement.</p> : null}</div>
              </form>
              {issued ? <div className="mt-5 rounded-xl border border-primary/40 bg-primary/5 p-4"><p className="font-semibold">API Secret is shown only once</p><p className="mt-1 text-sm text-muted-foreground">Copy and store it now. It cannot be recovered later.</p><pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-background p-3 text-xs">{'API Key: ' + issued.api_key + '\nAPI Secret: ' + issued.api_secret}</pre><button type="button" onClick={() => void copyIssuedCredentials()} className="mt-3 rounded-lg border border-border px-3 py-2 text-sm">Copy API Key + API Secret</button>{secretCopied ? <p className="mt-2 text-xs text-muted-foreground">Copied. Store the secret securely before leaving this page.</p> : null}</div> : null}
              <div className="mt-6"><p className="font-medium">Your developer API keys</p><p className="mt-1 text-xs text-muted-foreground">API Keys stay visible. API Secrets are never returned again. Rotate replaces a credential and issues a new one-time secret.</p>{developerKeys.length === 0 ? <p className="mt-3 rounded-lg border border-border/70 bg-background/40 p-4 text-sm text-muted-foreground">No developer keys created yet.</p> : <div className="mt-3 space-y-3">{developerKeys.map((key) => <div key={key.credential_id} className="rounded-xl border border-border/70 bg-background/40 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{key.label}</p><span className="rounded-full border border-border/70 px-2 py-0.5 text-[10px] text-muted-foreground">{integrationLabel(key.integration_type)}</span><span className="rounded-full border border-border/70 px-2 py-0.5 text-[10px] text-muted-foreground">{key.enabled && !key.revoked_at ? "Active" : "Revoked"}</span></div><code className="mt-2 block break-all text-xs text-muted-foreground">API Key: {key.key_id || "Unavailable"}</code><p className="mt-1 text-xs text-muted-foreground">Secret: hidden permanently after creation</p>{key.scopes?.length ? <p className="mt-1 break-words text-xs text-muted-foreground">Scopes: {key.scopes.join(", ")}</p> : null}</div><div className="flex flex-wrap gap-2">{key.key_id ? <button type="button" onClick={() => void copyText(key.key_id || "", "API Key copied.")} className="rounded-lg border border-border px-3 py-2 text-xs">Copy API Key</button> : null}{key.enabled && !key.revoked_at ? <><button type="button" onClick={() => void rotateCredential(key.credential_id)} disabled={busy} className="rounded-lg border border-border px-3 py-2 text-xs disabled:opacity-50">Rotate</button><button type="button" onClick={() => void revokeCredential(key.credential_id)} disabled={busy} className="rounded-lg border border-border px-3 py-2 text-xs text-destructive disabled:opacity-50">Revoke</button></> : null}</div></div></div>)}</div>}</div>
            </>}
          </div>
        </details>
      </section>

      <section className="mt-6 rounded-2xl border border-border/70 bg-card/30 p-6">
        <details>
          <summary className="cursor-pointer list-none"><span className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">INTEGRATION DETAILS</span><span className="mt-2 block text-2xl font-semibold">For builders who want the contract.</span><span className="mt-2 block max-w-2xl text-sm leading-6 text-muted-foreground">Discover → authenticate → request → 402 → pay → retry.</span></summary>
          <div className="mt-6 border-t border-border/70 pt-6">
            <div className="flex justify-end"><button type="button" onClick={() => void loadLiveManifest()} disabled={manifestBusy} className="rounded-lg border border-border px-3 py-2 text-xs font-medium disabled:opacity-50">{manifestBusy ? "Loading manifest..." : "Load live manifest"}</button></div>
            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              <article className="rounded-xl border border-border/70 bg-background/40 p-4"><p className="font-semibold">Discover</p><p className="mt-2 text-xs text-muted-foreground">Read the current machine contract.</p><pre className="mt-3 rounded-lg bg-background p-3 text-[10px] text-muted-foreground">GET /api/testnet/manifest</pre></article>
              <article className="rounded-xl border border-border/70 bg-background/40 p-4"><p className="font-semibold">Authenticate</p><p className="mt-2 text-xs text-muted-foreground">Keep the API Secret server-side.</p><pre className="mt-3 overflow-x-auto rounded-lg bg-background p-3 text-[10px] text-muted-foreground">Authorization: GeomacroTest &lt;API_KEY&gt;.&lt;API_SECRET&gt;</pre></article>
              <article className="rounded-xl border border-border/70 bg-background/40 p-4"><p className="font-semibold">Request</p><p className="mt-2 text-xs text-muted-foreground">Start with a country digest, then move to GRI, signed Risk Objects or Risk Gate.</p><pre className="mt-3 overflow-x-auto rounded-lg bg-background p-3 text-[10px] text-muted-foreground">{'POST /api/testnet/intelligence\nrequest_id: country-demo-0001\ncapability: structural_country_digest\nsubject: country / IND'}</pre></article>
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <article className="rounded-xl border border-border/70 bg-background/40 p-4"><p className="font-semibold">AI agent pattern</p><pre className="mt-3 rounded-lg bg-background p-4 text-[10px] text-muted-foreground">{'risk_gate_bundle\n→ receive 402\n→ pay quoted Testnet USDC\n→ retry same request_id\n→ verify machine response'}</pre></article>
              <article className="rounded-xl border border-border/70 bg-background/40 p-4"><p className="font-semibold">Account inspection</p><p className="mt-2 text-xs text-muted-foreground">Inspect entitlement, usage, prices and payment configuration without consuming credits.</p><pre className="mt-3 rounded-lg bg-background p-4 text-[10px] text-muted-foreground">GET /api/testnet/account</pre></article>
            </div>
            {liveManifest ? <pre className="mt-4 max-h-80 overflow-auto rounded-xl border border-border/70 bg-background p-4 text-[10px] leading-5 text-muted-foreground">{JSON.stringify(liveManifest, null, 2)}</pre> : null}
          </div>
        </details>
      </section>

      <section className="mt-6 rounded-2xl border border-primary/30 bg-primary/5 p-6 sm:p-8"><div className="flex flex-wrap items-end justify-between gap-4"><div className="max-w-2xl"><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">NEXT PRODUCTION MILESTONE</p><h2 className="mt-2 text-2xl font-semibold">Testnet is where you build. Mainnet is where production begins.</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Mainnet transaction features are not enabled here. This surface is for integration, verification and product discovery.</p></div><a href="/roadmap" className="rounded-lg border border-border bg-background/50 px-4 py-2.5 text-sm font-medium">View roadmap</a></div></section>

      <section className="mt-6 rounded-2xl border border-border/70 bg-card/30 p-6">
        <details>
          <summary className="cursor-pointer list-none"><span className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Public Testnet access</span><span className="mt-2 block text-2xl font-semibold">Normal users</span><span className="mt-2 block max-w-2xl text-sm leading-6 text-muted-foreground">Three public API keys, one for each supported Testnet. They are public identifiers, not secrets, and still require wallet sign-in, HTTP 402 payment and server-side verification.</span></summary>
          <div className="mt-5 border-t border-border/70 pt-5"><div className="grid gap-3 md:grid-cols-3">{Object.values(TESTNET_PUBLIC_API_KEYS).map((entry) => <div key={entry.chain_key} className="rounded-xl border border-border/70 bg-background/40 p-4"><p className="text-sm font-medium">{entry.label}</p><code className="mt-2 block break-all text-[11px] text-muted-foreground">{entry.public_api_key}</code><button type="button" onClick={() => void copyText(entry.public_api_key, entry.label + " public API key copied.")} className="mt-3 rounded-lg border border-border px-3 py-2 text-xs">Copy public key</button></div>)}</div></div>
        </details>
      </section>

      <section className="mt-6 rounded-2xl border border-border/70 bg-card/30 p-6">
        <details>
          <summary className="cursor-pointer list-none"><span className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">OPTIONAL FEEDBACK + X</span><span className="mt-2 block text-2xl font-semibold">Share the test, or leave feedback.</span><span className="mt-2 block max-w-2xl text-sm leading-6 text-muted-foreground">Optional. It never blocks Testnet access.</span></summary>
          <div className="mt-5 border-t border-border/70 pt-5">
            <div className="flex flex-wrap gap-2"><a href={X_SHARE_URL} target="_blank" rel="noreferrer" onClick={() => setShareOpened(true)} className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">Share on X</a><button type="button" onClick={openFollowIntent} disabled={followState === "confirmed"} className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium disabled:opacity-70">{followState === "confirmed" ? "Followed ✓" : "Follow @GeomacroLive"}</button><button type="button" onClick={() => setFeedbackOpen((value) => !value)} className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium">{feedbackOpen ? "Hide feedback form" : "Give feedback (optional)"}</button></div>
            {shareOpened ? <p className="mt-3 text-xs text-muted-foreground">X post composer opened with @GeomacroLive and the Testnet Access link. Edit the text freely before posting.</p> : null}
            {followState === "opened" ? <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-border/70 bg-background/40 p-3 text-sm text-muted-foreground"><span>X follow confirmation opened. X requires you to confirm the follow there.</span><button type="button" onClick={confirmFollow} className="rounded-lg border border-border px-3 py-1.5 text-xs text-foreground">I followed @GeomacroLive</button></div> : null}
            {feedbackOpen ? <form onSubmit={submitFeedback} className="mt-5 grid gap-4 sm:grid-cols-2">
              <div><label className="text-xs text-muted-foreground" htmlFor="feedbackTesterType">Testing as</label><select name="tester_type" id="feedbackTesterType" defaultValue="builder" className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"><option value="builder">Builder</option><option value="agent_project">AI agent project</option><option value="institution">Institution</option><option value="researcher">Researcher</option><option value="other">Other</option></select></div>
              <div><label className="text-xs text-muted-foreground" htmlFor="feedbackRating">Rating</label><select name="rating" id="feedbackRating" defaultValue="5" className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"><option value="5">5</option><option value="4">4</option><option value="3">3</option><option value="2">2</option><option value="1">1</option></select></div>
              <div><label className="text-xs text-muted-foreground" htmlFor="feedbackOutcome">Outcome</label><select name="outcome" id="feedbackOutcome" defaultValue="worked" className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"><option value="worked">Worked</option><option value="partly_worked">Partly worked</option><option value="blocked">Blocked</option><option value="exploring">Exploring</option></select></div>
              <div><label className="text-xs text-muted-foreground" htmlFor="feedbackWouldIntegrate">Would integrate?</label><select name="would_integrate" id="feedbackWouldIntegrate" defaultValue="unsure" className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"><option value="yes">Yes</option><option value="unsure">Unsure</option><option value="no">No</option></select></div>
              <div className="sm:col-span-2"><label className="text-xs text-muted-foreground" htmlFor="feedbackMostValuable">Most valuable</label><textarea name="most_valuable" maxLength={1000} id="feedbackMostValuable" className="mt-2 min-h-24 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm" /></div>
              <div className="sm:col-span-2"><label className="text-xs text-muted-foreground" htmlFor="feedbackFriction">Friction or confusion</label><textarea name="friction" maxLength={1000} id="feedbackFriction" className="mt-2 min-h-24 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm" /></div>
              <div className="sm:col-span-2"><label className="text-xs text-muted-foreground" htmlFor="feedbackMissingCapability">Missing capability</label><textarea name="missing_capability" maxLength={1000} id="feedbackMissingCapability" className="mt-2 min-h-24 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm" /></div>
              <div className="sm:col-span-2"><button disabled={feedbackBusy} className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">{feedbackBusy ? "Sending…" : "Send optional feedback"}</button>{feedbackStatus ? <p className="mt-2 text-xs text-muted-foreground">{feedbackStatus}</p> : null}</div>
            </form> : null}
          </div>
        </details>
      </section>

      <section className="mt-6 rounded-xl border border-border/70 bg-background/30 p-4 text-xs text-muted-foreground">Testnet only · Non-revenue · structured delivery · <code>execution_authorized=false</code> for Risk Gate outputs.</section>
    </main>
  );