import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { A2AProtocolError } from "./a2a-signature.server";

function configuredOrigins() {
  return new Set(
    String(process.env.GEOMACRO_A2A_CALLBACK_ALLOWLIST ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => {
        try {
          return new URL(value).origin;
        } catch {
          return "";
        }
      })
      .filter(Boolean),
  );
}

function isPublicIpv4(address: string) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0) return false;
  if (a === 192 && b === 0 && parts[2] === 2) return false;
  if (a === 198 && (b === 18 || b === 19 || b === 51)) return false;
  if (a === 203 && b === 0 && parts[2] === 113) return false;
  return true;
}

function isPublicIp(address: string) {
  const version = isIP(address);
  if (version === 4) return isPublicIpv4(address);
  if (version !== 6) return false;

  const normalized = address.toLowerCase();
  if (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized) ||
    normalized.startsWith("ff") ||
    normalized.startsWith("2001:db8:")
  ) {
    return false;
  }
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPublicIpv4(mapped[1]);
  return true;
}

export async function validateA2ACallbackUrl(
  rawUrl: string,
  identityOrigins: string[],
) {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new A2AProtocolError(400, "A2A_CALLBACK_URL_INVALID", "A2A callback URL is invalid.");
  }

  if (url.protocol !== "https:" || url.username || url.password || rawUrl.length > 2048) {
    throw new A2AProtocolError(400, "A2A_CALLBACK_URL_INVALID", "A2A callbacks require a bounded HTTPS URL without embedded credentials.");
  }
  if (url.hostname === "localhost" || url.hostname.endsWith(".local")) {
    throw new A2AProtocolError(400, "A2A_CALLBACK_TARGET_BLOCKED", "Local callback targets are not allowed.");
  }

  const identityAllowlist = new Set(identityOrigins.map((value) => {
    try {
      return new URL(value).origin;
    } catch {
      return "";
    }
  }).filter(Boolean));
  if (!identityAllowlist.has(url.origin)) {
    throw new A2AProtocolError(403, "A2A_CALLBACK_ORIGIN_NOT_REGISTERED", "Callback origin is not registered for this A2A identity.");
  }

  const serverAllowlist = configuredOrigins();
  if (!serverAllowlist.has(url.origin)) {
    throw new A2AProtocolError(403, "A2A_CALLBACK_ORIGIN_NOT_ALLOWED", "Callback origin is not enabled by the Geomacro server allowlist.");
  }

  const directVersion = isIP(url.hostname);
  const addresses = directVersion
    ? [{ address: url.hostname, family: directVersion }]
    : await lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((entry) => !isPublicIp(entry.address))) {
    throw new A2AProtocolError(403, "A2A_CALLBACK_TARGET_BLOCKED", "Callback target resolves to a non-public network address.");
  }

  return url;
}

export async function deliverA2ACallback(input: {
  url: string;
  identityOrigins: string[];
  taskId: string;
  clientTaskId: string;
  resultHash: string;
  result: unknown;
}) {
  const url = await validateA2ACallbackUrl(input.url, input.identityOrigins);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "Geomacro-A2A/1",
      "x-geomacro-a2a-event": "task.completed",
      "x-geomacro-a2a-task-id": input.taskId,
      "x-geomacro-a2a-result-sha256": input.resultHash,
    },
    body: JSON.stringify({
      protocol_version: "geomacro-a2a/1",
      event: "task.completed",
      task_id: input.taskId,
      client_task_id: input.clientTaskId,
      result_sha256: input.resultHash,
      result: input.result,
      execution_authorized: false,
    }),
    redirect: "error",
    signal: AbortSignal.timeout(4_000),
  });

  if (!response.ok) {
    throw new A2AProtocolError(502, "A2A_CALLBACK_DELIVERY_FAILED", `Callback returned HTTP ${response.status}.`);
  }
  return { status: response.status };
}
