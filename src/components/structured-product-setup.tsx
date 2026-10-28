import { useState } from "react";
import {
  structuredProductSetup,
  STRUCTURED_PRODUCT_CHECK_PATH,
} from "../lib/structured-product-setup";

const setup = structuredProductSetup();
/** The checker returns readiness metadata, never the paid customer payload. */
export function StructuredProductSetup() {
  const [selected, setSelected] = useState(setup.products[0].id);
  const product = setup.products.find((row) => row.id === selected)!;
  const template = (row: typeof product) => JSON.stringify(row.example_request, null, 2);
  const [body, setBody] = useState(() => template(product));
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function check() {
    setBusy(true);
    setResult(null);
    try {
      JSON.parse(body);
      const response = await fetch(STRUCTURED_PRODUCT_CHECK_PATH, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: AbortSignal.timeout(30_000),
      });
      const data = await response.json();
      setResult(JSON.stringify(data, null, 2));
    } catch {
      setResult("Check could not complete. Use valid JSON and try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="mt-10 rounded-2xl border border-border p-6"
      aria-label="Structured product setup"
    >
      <h2 className="text-xl font-semibold">Set up a structured data request</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Choose a product and edit the country or corridor. Check whether the requested data can be
        prepared before buying. This check does not charge you. Availability and payment are checked
        again at purchase.
      </p>
      <label className="mt-5 block text-sm font-medium" htmlFor="structured-product">
        Select a product to check
      </label>
      <select
        id="structured-product"
        disabled={busy}
        value={selected}
        className="mt-2 w-full rounded-lg border border-border bg-background p-3 text-sm"
        onChange={(event) => {
          const row = setup.products.find((p) => p.id === event.target.value)!;
          setSelected(row.id);
          setBody(template(row));
          setResult(null);
        }}
      >
        {setup.products.map((row) => (
          <option key={row.id} value={row.id}>
            {row.id.replaceAll("_", " ")}
          </option>
        ))}
      </select>
      <p className="mt-3 text-sm text-muted-foreground">{product.description}</p>
      {product.request_time_instruction && (
        <p className="mt-3 text-sm">{product.request_time_instruction}</p>
      )}
      <label className="mt-4 block text-sm font-medium" htmlFor="structured-request">
        Request JSON
      </label>
      <textarea
        id="structured-request"
        disabled={busy}
        spellCheck={false}
        rows={14}
        value={body}
        onChange={(event) => {
          setBody(event.target.value);
          setResult(null);
        }}
        className="mt-2 w-full rounded-lg border border-border bg-background p-3 font-mono text-xs"
      />
      <button
        type="button"
        disabled={busy}
        onClick={check}
        className="mt-3 min-h-11 rounded-lg border border-border px-4 text-sm font-medium disabled:opacity-50"
      >
        {busy ? "Checking preparation…" : "Check preparation · no charge"}
      </button>
      <div aria-live="polite">
        {result && (
          <pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted p-4 text-xs">
            {result}
          </pre>
        )}
      </div>
      <details className="mt-5 text-sm">
        <summary className="cursor-pointer">Fields included with this product</summary>
        <ul className="mt-3 space-y-1 font-mono text-xs">
          {product.required_fields.map((field) => (
            <li key={field}>{field}</li>
          ))}
        </ul>
      </details>
      <p className="mt-4 text-xs text-muted-foreground">
        Prepared products are delivered as structured JSON through the same API for people,
        applications and agents. Signed products require a valid published signature. Source
        articles and private records are excluded.
      </p>
    </section>
  );
}
