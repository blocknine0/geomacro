#!/usr/bin/env bun
/** Local/private operator tool. Input never leaves the process for extraction.
 * --product optionally prepares actual existing qualified context, no funds. */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { buildNewsProductPacket } from "../../src/lib/news-product-factory.ts";
import { normalizeReusableNewsJson } from "../../src/lib/reusable-news-json.ts";
const args = process.argv.slice(2),
  allowed = ["--input", "--output", "--product", "--destination", "--issued-after"];
const values = new Map<string, string>();
for (let i = 0; i < args.length; i += 2) {
  if (
    !allowed.includes(args[i]) ||
    values.has(args[i]) ||
    !args[i + 1] ||
    args[i + 1].startsWith("--")
  )
    throw Error(
      "Usage: --input news.json --output products.json [--product query_focused] [--destination CAN] [--issued-after UTC]",
    );
  values.set(args[i], args[i + 1]);
}
if (!values.has("--input") || !values.has("--output"))
  throw Error("NEWS_FACTORY_INPUT_AND_OUTPUT_REQUIRED");
const path = resolve(values.get("--input")!);
const bytes = readFileSync(path);
if (bytes.byteLength > 16_384) throw Error("NEWS_FACTORY_INPUT_TOO_LARGE");
const input = JSON.parse(bytes.toString("utf8"));
const options = { destination_country_iso3: values.get("--destination") };
const news = normalizeReusableNewsJson(input);
let output: unknown = await buildNewsProductPacket(news, options);
if (values.has("--product")) {
  const { materializeNewsProduct } = await import("../../src/lib/news-product-factory.server.ts");
  output = await materializeNewsProduct({
    news,
    product_id: values.get("--product")!,
    ...options,
    issued_after: values.get("--issued-after"),
  });
}
const target = resolve(values.get("--output")!);
if (target === path) throw Error("NEWS_FACTORY_INPUT_OUTPUT_MUST_DIFFER");
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, JSON.stringify(output, null, 2) + "\n", { mode: 0o600 });
console.log(JSON.stringify({ ok: true, output: target, payment_authorized: false }));
