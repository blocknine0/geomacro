import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";

export type TxState = "confirm" | "pending" | "complete" | "failed";

type NetworkLike = {
  chainName: string;
  explorer: string;
  [key: string]: unknown;
};

export function ExplorerLink({
  network,
  hash,
  label = "View transaction",
  className = "",
}: {
  network: NetworkLike;
  hash?: string | null;
  label?: string;
  className?: string;
}) {
  if (!hash) return null;

  return (
    <a
      href={`${network.explorer}/tx/${hash}`}
      target="_blank"
      rel="noreferrer"
      className={`text-xs font-medium text-primary underline-offset-4 hover:underline ${className}`}
    >
      {label}
    </a>
  );
}

export function TestnetNotice({
  network,
  className = "",
}: {
  network: NetworkLike;
  className?: string;
}) {
  return (
    <div
      className={`rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground ${className}`}
      role="note"
    >
      You are using {network.chainName}. Assets and transactions shown here are
      testnet-only and do not represent production funds.
    </div>
  );
}

export function WrongNetworkNotice({
  targetName,
  onSwitch,
  className = "",
}: {
  targetName: string;
  onSwitch: () => void;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 ${className}`}
      role="alert"
    >
      <p className="text-sm text-destructive">
        Switch your wallet to {targetName} to continue.
      </p>

      <button
        type="button"
        onClick={onSwitch}
        className="rounded-md border border-destructive/30 px-3 py-1.5 text-xs font-medium text-destructive transition hover:bg-destructive/10"
      >
        Switch network
      </button>
    </div>
  );
}

export function WalletActionBoundary({
  connected,
  connecting = false,
  onConnect,
  children,
  className = "",
}: {
  connected: boolean;
  connecting?: boolean;
  onConnect: () => void;
  children?: ReactNode;
  className?: string;
}) {
  if (connected) return <>{children}</>;

  return (
    <div
      className={`rounded-lg border border-border/60 bg-muted/20 px-4 py-4 ${className}`}
    >
      <p className="mb-3 text-sm text-muted-foreground">
        Connect your wallet to participate in this market.
      </p>

      <button
        type="button"
        disabled={connecting}
        onClick={onConnect}
        className="rounded-md border border-border px-3 py-2 text-sm font-medium transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
      >
        {connecting ? "Connecting…" : "Connect wallet"}
      </button>
    </div>
  );
}

export function TransactionProgress({
  state,
  message,
  className = "",
}: {
  state: TxState;
  message?: string;
  className?: string;
}) {
  const labels: Record<TxState, string> = {
    confirm: "Confirm the transaction in your wallet.",
    pending: "Transaction submitted. Waiting for network confirmation.",
    complete: "Transaction submitted successfully.",
    failed: message || "Transaction failed.",
  };

  return (
    <div
      className={`flex items-center gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm ${
        state === "failed" ? "text-destructive" : "text-muted-foreground"
      } ${className}`}
      role={state === "failed" ? "alert" : "status"}
    >
      {(state === "confirm" || state === "pending") && (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
      )}
      <span>{labels[state]}</span>
    </div>
  );
}

type DisclosureRow = {
  label: string;
  value?: string | number | null;
  href?: string;
};

export function TechnicalDisclosure({
  rows,
  className = "",
}: {
  rows: DisclosureRow[];
  className?: string;
}) {
  return (
    <details
      className={`rounded-lg border border-border/60 bg-background/40 ${className}`}
    >
      <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-muted-foreground">
        Technical details
      </summary>

      <dl className="space-y-2 border-t border-border/60 px-3 py-3">
        {rows.map((row, index) => (
          <div
            key={`${row.label}-${index}`}
            className="flex flex-wrap items-start justify-between gap-3 text-xs"
          >
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd className="max-w-full break-all text-right font-mono text-foreground">
              {row.value === null ||
              row.value === undefined ||
              row.value === "" ? (
                <span className="text-muted-foreground">—</span>
              ) : row.href ? (
                <a
                  href={row.href}
                  target="_blank"
                  rel="noreferrer"
                  className="underline-offset-4 hover:underline"
                >
                  {String(row.value)}
                </a>
              ) : (
                String(row.value)
              )}
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
