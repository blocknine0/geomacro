import { KeyRound } from "lucide-react";
export function ApiKeysNotice() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-primary/25 bg-primary/5 p-5">
      <div className="flex items-center gap-3">
        <KeyRound className="h-5 w-5 text-primary" aria-hidden />
        <div>
          <h2 className="text-sm font-semibold">
            Per-call API pricing <span className="ml-2 text-primary">Published</span>
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Approved prices for all three category APIs are published in the Store. API keys: Coming soon. Self-service access and checkout are not open yet.
          </p>
        </div>
      </div>
      <a
        className="gm-text-link text-sm"
        href="mailto:contact@geomacro.live?subject=Geomacro%20launch%20access"
      >
        Enquire about launch access ↗
      </a>
    </div>
  );
}
