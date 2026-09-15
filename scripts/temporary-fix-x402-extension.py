from pathlib import Path

p = Path("src/routes/api.x402.intelligence.ts")
s = p.read_text()
old = '''    geomacro: {
      product: PRODUCT_ID,
      query_plan_hash: planHash,
      execution_authorized: false,
    },'''
new = '''    geomacro: {
      info: {
        product: PRODUCT_ID,
        query_plan_hash: planHash,
        execution_authorized: false,
      },
      schema: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: {
          product: { type: "string" },
          query_plan_hash: { type: "string" },
          execution_authorized: { type: "boolean", const: false },
        },
        required: ["product", "query_plan_hash", "execution_authorized"],
      },
    },'''
if old not in s:
    raise SystemExit("expected geomacro extension block not found")
s = s.replace(old, new, 1)
old2 = '''  const binding = geomacro as Record<string, unknown>;
  if (binding.product !== PRODUCT_ID || binding.query_plan_hash !== planHash) {
    throw new Error("PAYMENT_QUERY_PLAN_MISMATCH");
  }'''
new2 = '''  const extension = geomacro as Record<string, unknown>;
  const info = extension.info;
  if (!info || typeof info !== "object" || Array.isArray(info)) {
    throw new Error("PAYMENT_QUERY_BINDING_EXTENSION_MISSING");
  }
  const binding = info as Record<string, unknown>;
  if (binding.product !== PRODUCT_ID || binding.query_plan_hash !== planHash) {
    throw new Error("PAYMENT_QUERY_PLAN_MISMATCH");
  }'''
if old2 not in s:
    raise SystemExit("expected binding block not found")
s = s.replace(old2, new2, 1)
p.write_text(s)
