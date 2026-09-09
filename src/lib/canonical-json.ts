type JsonPrimitive =
  | null
  | boolean
  | number
  | string;

function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return (
    prototype === Object.prototype ||
    prototype === null
  );
}

function canonicalPrimitive(
  value: JsonPrimitive,
): string {
  if (value === null) return "null";

  if (typeof value === "string") {
    return JSON.stringify(value);
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (!Number.isFinite(value)) {
    throw new TypeError(
      "Canonical JSON rejects non-finite numbers",
    );
  }

  // JSON.stringify serializes -0 as 0. Preserve that JSON semantic so
  // semantically identical parsed request bodies receive the same hash.
  return Object.is(value, -0)
    ? "0"
    : String(value);
}

/**
 * Deterministic JSON serialization for already-parsed API payloads.
 *
 * Object keys are sorted recursively while array order is preserved. Values
 * outside the JSON data model fail closed rather than receiving unstable or
 * implementation-specific representations.
 */
export function canonicalJson(
  value: unknown,
): string {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    typeof value === "number"
  ) {
    return canonicalPrimitive(
      value as JsonPrimitive,
    );
  }

  if (Array.isArray(value)) {
    return `[${value
      .map((item) => canonicalJson(item))
      .join(",")}]`;
  }

  if (isPlainObject(value)) {
    const entries = Object.keys(value)
      .sort()
      .map((key) => {
        const item = value[key];
        if (
          item === undefined ||
          typeof item === "function" ||
          typeof item === "symbol" ||
          typeof item === "bigint"
        ) {
          throw new TypeError(
            `Canonical JSON rejects non-JSON value at key ${key}`,
          );
        }

        return `${JSON.stringify(key)}:${canonicalJson(item)}`;
      });

    return `{${entries.join(",")}}`;
  }

  throw new TypeError(
    "Canonical JSON accepts only JSON primitives, arrays and plain objects",
  );
}
