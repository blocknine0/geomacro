type ClientErrorOptions = {
  mechanism?: "manual" | "onerror" | "unhandledrejection" | "react_error_boundary";
  handled?: boolean;
  severity?: "error" | "warning" | "info";
};

type LovableEvents = {
  captureException?: (
    error: unknown,
    context?: Record<string, unknown>,
    options?: ClientErrorOptions,
  ) => void;
};

declare global {
  interface Window {
    // __lovableEvents নামটা Lovable-এর নিজের preview runtime-এর injected global —
    // এটাই একমাত্র hook যেটার মাধ্যমে Lovable-এর editor preview-তে error surface হয়।
    // লাইভ production site-এ (geomacro.live) এই global থাকে না, তাই captureException
    // optional chaining দিয়ে চুপচাপ no-op হয়ে যায়।
    __lovableEvents?: LovableEvents;
  }
}

export function reportClientError(error: unknown, context: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  window.__lovableEvents?.captureException?.(
    error,
    {
      source: "react_error_boundary",
      route: window.location.pathname,
      ...context,
    },
    {
      mechanism: "react_error_boundary",
      handled: false,
      severity: "error",
    },
  );
}
