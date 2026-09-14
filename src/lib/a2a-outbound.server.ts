import {
  createPrivateKey,
  randomBytes,
  sign as signPayload,
} from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { z } from "zod";

import {
  a2aTaskRequestSchema,
  canonicalA2ASigningPayload,
  GEOMACRO_A2A_PROTOCOL_VERSION,
  sha256A2A,
  type A2ATaskRequest,
} from "./a2a-contract";
import { A2AProtocolError } from "./a2a-signature.server";

const remoteManifestSchema = z.object({
  protocol: z.object({
    version: z.literal(GEOMACRO_A2A_PROTOCOL_VERSION),
  }),
  endpoints: z.object({
    negotiate: z.string().url(),
    tasks: z.string().url(),
    task_status_template: z.string().optional(),
  }),
  capabilities: z.array(z.object({ id: z.string() })),
});

function configuredOutboundOrigins() {
  return new Set(
    String(process.env.GEOMACRO_A2A_OUTBOUND_ALLOWLIST ?? "")
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
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b, c] = parts;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

function isPublicIp(address: string) {
  const version = isIP(address);
  if (version === 4) return isPublicIpv4(address);
  if (version !== 6) return false;
  const value = address.toLowerCase();
  if (
    value === "::" ||
    value === "::1" ||
    value.startsWith("fc") ||
    value.startsWith("fd") ||
    /^fe[89ab]/.test(value) ||
    value.startsWith("ff") ||
    value.startsWith("2001:db8:")
  ) return false;
  const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return mapped ? isPublicIpv4(mapped[1]) : true;
}

async function validateOutboundUrl(raw: string, expectedOrigin?: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new A2AProtocolError(400, "A2A_REMOTE_URL_INVALID", "Remote A2A URL is invalid.");
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new A2AProtocolError(400, "A2A_REMOTE_URL_INVALID", "Remote A2A URL must use HTTPS without embedded credentials.");
  }
  if (expectedOrigin && url.origin !== expectedOrigin) {
    throw new A2AProtocolError(400, "A2A_REMOTE_ORIGIN_MISMATCH", "Remote A2A manifest attempted to switch origins.");
  }
  if (!configuredOutboundOrigins().has(url.origin)) {
    throw new A2AProtocolError(403, "A2A_REMOTE_ORIGIN_NOT_ALLOWED", "Remote A2A origin is not enabled by GEOMACRO_A2A_OUTBOUND_ALLOWLIST.");
  }
  if (url.hostname === "localhost" || url.hostname.endsWith(".local")) {
    throw new A2AProtocolError(403, "A2A_REMOTE_TARGET_BLOCKED", "Local A2A targets are not allowed.");
  }

  const direct = isIP(url.hostname);
  const addresses = direct
    ? [{ address: url.hostname, family: direct }]
    : await lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((entry) => !isPublicIp(entry.address))) {
    throw new A2AProtocolError(403, "A2A_REMOTE_TARGET_BLOCKED", "Remote A2A target resolves to a non-public network address.");
  }
  return url;
}

function outboundIdentity() {
  const agentId = String(process.env.GEOMACRO_A2A_OUTBOUND_AGENT_ID ?? "geomacro").trim().toLowerCase();
  const privateKeyPem = String(process.env.GEOMACRO_A2A_OUTBOUND_PRIVATE_KEY_PEM ?? "").replace(/\\n/g, "\n").trim();
  if (!/^[a-z0-9][a-z0-9._:-]{2,63}$/.test(agentId) || privateKeyPem.length < 64) {
    throw new A2AProtocolError(503, "A2A_OUTBOUND_IDENTITY_NOT_CONFIGURED", "Geomacro outbound A2A signing identity is not configured.");
  }
  let privateKey;
  try {
    privateKey = createPrivateKey(privateKeyPem);
  } catch {
    throw new A2AProtocolError(503, "A2A_OUTBOUND_PRIVATE_KEY_INVALID", "Geomacro outbound A2A private key is invalid.");
  }
  if (privateKey.asymmetricKeyType !== "ed25519") {
    throw new A2AProtocolError(503, "A2A_OUTBOUND_PRIVATE_KEY_INVALID", "Geomacro outbound A2A key must be Ed25519.");
  }
  return { agentId, privateKey };
}

export async function discoverRemoteA2A(baseUrl: string) {
  const base = await validateOutboundUrl(baseUrl);
  const discovery = await validateOutboundUrl(
    new URL("/.well-known/geomacro-a2a.json", `${base.origin}/`).toString(),
    base.origin,
  );
  const response = await fetch(discovery, {
    method: "GET",
    headers: { accept: "application/json", "user-agent": "Geomacro-A2A/1" },
    redirect: "error",
    signal: AbortSignal.timeout(4_000),
  });
  if (!response.ok) {
    throw new A2AProtocolError(502, "A2A_REMOTE_DISCOVERY_FAILED", `Remote A2A discovery returned HTTP ${response.status}.`);
  }
  const manifest = remoteManifestSchema.parse(await response.json());
  await validateOutboundUrl(manifest.endpoints.negotiate, base.origin);
  await validateOutboundUrl(manifest.endpoints.tasks, base.origin);
  return { base_origin: base.origin, manifest };
}

export async function negotiateRemoteA2A(baseUrl: string) {
  const discovered = await discoverRemoteA2A(baseUrl);
  const endpoint = await validateOutboundUrl(discovered.manifest.endpoints.negotiate, discovered.base_origin);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json", "user-agent": "Geomacro-A2A/1" },
    body: JSON.stringify({
      protocol_versions: [GEOMACRO_A2A_PROTOCOL_VERSION],
      capabilities: ["risk_preflight"],
      payment_modes: ["commercial_credit", "x402_testnet"],
      callback_modes: ["poll"],
    }),
    redirect: "error",
    signal: AbortSignal.timeout(4_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new A2AProtocolError(502, "A2A_REMOTE_NEGOTIATION_FAILED", `Remote A2A negotiation returned HTTP ${response.status}.`);
  }
  return { ...discovered, negotiation: body };
}

export async function dispatchRemoteA2ATask(input: {
  baseUrl: string;
  task: A2ATaskRequest;
}) {
  const task = a2aTaskRequestSchema.parse(input.task);
  const negotiated = await negotiateRemoteA2A(input.baseUrl);
  const endpoint = await validateOutboundUrl(negotiated.manifest.endpoints.tasks, negotiated.base_origin);
  const bodyText = JSON.stringify(task);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = randomBytes(24).toString("base64url");
  const identity = outboundIdentity();
  const signingPayload = canonicalA2ASigningPayload({
    method: "POST",
    pathname: endpoint.pathname,
    timestamp,
    nonce,
    bodySha256: sha256A2A(bodyText),
  });
  const signature = signPayload(null, Buffer.from(signingPayload, "utf8"), identity.privateKey).toString("base64url");

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "user-agent": "Geomacro-A2A/1",
      "x-geomacro-a2a-agent-id": identity.agentId,
      "x-geomacro-a2a-timestamp": timestamp,
      "x-geomacro-a2a-nonce": nonce,
      "x-geomacro-a2a-signature": signature,
    },
    body: bodyText,
    redirect: "error",
    signal: AbortSignal.timeout(12_000),
  });
  const body = await response.json().catch(() => ({}));
  const paymentRequired = response.headers.get("payment-required");

  return {
    status: response.status,
    ok: response.ok,
    body,
    payment_required: paymentRequired,
    remote_origin: negotiated.base_origin,
    note: response.status === 402
      ? "Remote x402 payment was requested. Geomacro does not auto-spend from an unapproved wallet in the generic outbound dispatcher."
      : null,
  };
}
