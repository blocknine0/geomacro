import { useState } from "react";
import { GEOMACRO_API_EXAMPLES, GEOMACRO_PUBLIC_API_ENDPOINTS } from "@/lib/public-api-endpoints";

const examples = [
  { id: "query", label: "Unified query", path: "/api/v1/intelligence/query" },
  { id: "geopolitics", label: "Geopolitics", path: "/api/v1/intelligence/geopolitics" },
  { id: "macro_fx", label: "Macro / FX", path: "/api/v1/intelligence/macro-fx" },
  { id: "critical_minerals", label: "Critical Minerals", path: "/api/v1/intelligence/critical-minerals" },
  { id: "availability", label: "Baseline availability", path: "/api/v1/intelligence/availability" },
  { id: "price_preflight", label: "Price preview", path: "/api/v1/payments/preflight" },
  { id: "agent", label: "AI agent", path: "/api/v1/agent" },
] as const;

export function ApiEndpointDirectory() {
  const [selected, setSelected] = useState<(typeof examples)[number]>(examples[0]);
  const curl = `curl -i 'https://geomacro.live${selected.path}' \\\n  -H 'Content-Type: application/json' \\\n  --data '${JSON.stringify(GEOMACRO_API_EXAMPLES[selected.id], null, 2)}'`;
  return <section id="endpoints" aria-labelledby="endpoints-title" className="mt-10 scroll-mt-24">
    <p className="gm-eyebrow">Developer reference</p>
    <h2 id="endpoints-title" className="mt-3 text-2xl font-semibold">Endpoints for your integration.</h2>
    <p className="mt-3 text-sm leading-6 text-muted-foreground">Base URL: <code>https://geomacro.live</code>. POST requests use JSON. Self-service API keys are coming soon; these are the existing discovery, research and governed x402 interfaces.</p>
    <div className="mt-4 flex flex-wrap gap-5 text-sm">
      <a href="/api/v1/agent?view=openapi" className="gm-text-link">OpenAPI 3.1 schema ↗</a>
      <a href="/api/v1/agent" className="gm-text-link">Agent discovery ↗</a>
      <a href="/.well-known/agent-card.json" className="gm-text-link">Agent card ↗</a>
    </div>
    <div className="mt-6 overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Public Geomacro endpoints, HTTP methods and access boundaries</caption>
        <thead className="bg-muted/40"><tr><th scope="col" className="p-4">Endpoint</th><th scope="col" className="p-4">Use & access</th></tr></thead>
        <tbody>{GEOMACRO_PUBLIC_API_ENDPOINTS.map(endpoint => <tr key={endpoint.id} className="border-t border-border align-top">
          <th scope="row" className="p-4 font-normal"><span className="block font-medium">{endpoint.name}</span><span className="mt-1 block font-mono text-xs text-primary">{endpoint.methods.join(" / ")}</span><code className="mt-1 block break-all text-xs">{endpoint.path}</code></th>
          <td className="min-w-56 p-4 leading-6"><p>{endpoint.purpose}</p><p className="mt-1 text-xs text-muted-foreground">{endpoint.access}</p></td>
        </tr>)}</tbody>
      </table>
    </div>
    <details className="mt-6 rounded-xl border border-border p-5">
      <summary className="cursor-pointer font-medium">Request examples & response handling</summary>
      <label className="mt-5 block text-sm">Example request<select value={selected.id} onChange={event => setSelected(examples.find(example => example.id === event.target.value)!)} className="mt-2 block w-full rounded border border-border bg-background p-3 sm:max-w-sm">{examples.map(example => <option key={example.id} value={example.id}>{example.label}</option>)}</select></label>
      <pre className="mt-4 overflow-x-auto rounded-lg bg-muted/40 p-4 text-xs leading-6"><code>{curl}</code></pre>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">These examples send no payment proof. Category APIs accept countries and bind topics automatically. Use the unified query for corridors or multiple categories. Category requests default to live_on_demand; these examples explicitly use published_only. Routing does not establish fresh coverage.</p>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">Category GET research views: <code>?view=finds</code>, <code>?view=latest</code>, <code>?view=open-data</code> or <code>?view=combined</code>. Release and dataset reference dates remain separate.</p>
      <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-6 text-muted-foreground">
        <li><strong>200:</strong> Read the contract. Research, discovery and preflight success do not establish paid signed delivery.</li>
        <li><strong>402:</strong> Check the resource, network, USDC amount, expiry and quote before authorizing payment. Retry the exact request with PAYMENT-SIGNATURE; verify PAYMENT-RESPONSE and the delivery hash.</li>
        <li><strong>400 / 415:</strong> Correct the request or content type. <strong>422:</strong> Answer ineligible; do not pay.</li>
        <li><strong>409:</strong> Resolve or recover the same request. <strong>429:</strong> Back off, honoring Retry-After when present. <strong>503:</strong> Required runtime or evidence unavailable. Never authorize another payment to retry an uncertain settlement.</li>
      </ul>
      <p className="mt-4 text-xs leading-6 text-muted-foreground">Derived structured output only. Approved USDC prices and per-request evidence, rights and signature checks apply.</p>
    </details>
  </section>;
}
