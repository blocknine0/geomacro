import { getHeader, type H3Event } from "h3";

function hostname(value: string) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return "";
  }
}

export function assertTestnetAuthSameOrigin(event: H3Event) {
  const origin = String(getHeader(event, "origin") ?? getHeader(event, "referer") ?? "").trim();
  const hostHeader = String(getHeader(event, "host") ?? "").trim().toLowerCase();
  if (!origin || !hostHeader) throw new Error("TESTNET_AUTH_ORIGIN_REQUIRED");

  const originHost = hostname(origin);
  const requestHost = hostHeader.split(":")[0];
  if (!originHost || !requestHost) throw new Error("TESTNET_AUTH_ORIGIN_FORBIDDEN");
  if (originHost === requestHost) return;

  const local = new Set(["localhost", "127.0.0.1"]);
  if (local.has(originHost) && local.has(requestHost)) return;

  const configured = String(process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  const allowed = new Set(
    configured.length > 0
      ? configured
      : [
          "geomacro.live",
          "www.geomacro.live",
          "geomacrooracle.lovable.app",
          "id-preview--06310982-d80d-4d51-a786-7a015bd39be3.lovable.app",
        ],
  );

  if (allowed.has(originHost) && allowed.has(requestHost)) return;
  throw new Error("TESTNET_AUTH_ORIGIN_FORBIDDEN");
}
