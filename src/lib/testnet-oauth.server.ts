import { createHash, randomBytes } from "node:crypto";
import {
  deleteCookie,
  getCookie,
  setCookie,
  type H3Event,
} from "h3";

import {
  consumeTesterOauthIdentity,
  issueTesterOauthState,
} from "./testnet-tester-account.server";

export type TesterOauthProvider = "x" | "discord";

const OAUTH_COOKIE_MAX_AGE = 10 * 60;

function base64url(input: Buffer) {
  return input.toString("base64url");
}

function sha256base64url(value: string) {
  return base64url(createHash("sha256").update(value).digest());
}

function requireEnv(name: string, env: Record<string, string | undefined> = process.env) {
  const value = String(env[name] ?? "").trim();
  if (!value) throw new Error(`${name}_NOT_CONFIGURED`);
  return value;
}

function siteUrl(env: Record<string, string | undefined> = process.env) {
  return requireEnv("PUBLIC_SITE_URL", env).replace(/\/$/, "");
}

function cookieName(provider: TesterOauthProvider) {
  return `__Host-geomacro_test_oauth_${provider}`;
}

function encodeOauthCookie(payload: { state: string; verifier?: string }) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeOauthCookie(value: string) {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as {
      state?: unknown;
      verifier?: unknown;
    };
    return {
      state: typeof parsed.state === "string" ? parsed.state : "",
      verifier: typeof parsed.verifier === "string" ? parsed.verifier : undefined,
    };
  } catch {
    return null;
  }
}

function setOauthCookie(
  event: H3Event,
  provider: TesterOauthProvider,
  payload: { state: string; verifier?: string },
) {
  setCookie(event, cookieName(provider), encodeOauthCookie(payload), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: OAUTH_COOKIE_MAX_AGE,
  });
}

export function clearTesterOauthCookie(event: H3Event, provider: TesterOauthProvider) {
  deleteCookie(event, cookieName(provider), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
  });
}

export async function buildTesterOauthAuthorizeUrl(input: {
  event: H3Event;
  principalId: string;
  provider: TesterOauthProvider;
  env?: Record<string, string | undefined>;
}) {
  const env = input.env ?? process.env;
  const issued = await issueTesterOauthState({
    principalId: input.principalId,
    provider: input.provider,
  });

  if (input.provider === "x") {
    const clientId = requireEnv("X_OAUTH_CLIENT_ID", env);
    const redirectUri = `${siteUrl(env)}/api/testnet-tester/oauth/x/callback`;
    const verifier = randomBytes(48).toString("base64url");
    const challenge = sha256base64url(verifier);
    setOauthCookie(input.event, "x", { state: issued.state, verifier });

    const url = new URL("https://x.com/i/oauth2/authorize");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", "users.read");
    url.searchParams.set("state", issued.state);
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
    return url.toString();
  }

  const clientId = requireEnv("DISCORD_OAUTH_CLIENT_ID", env);
  const redirectUri = `${siteUrl(env)}/api/testnet-tester/oauth/discord/callback`;
  setOauthCookie(input.event, "discord", { state: issued.state });

  const url = new URL("https://discord.com/oauth2/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", "identify");
  url.searchParams.set("state", issued.state);
  return url.toString();
}

async function exchangeXCode(input: {
  code: string;
  verifier: string;
  env: Record<string, string | undefined>;
}) {
  const clientId = requireEnv("X_OAUTH_CLIENT_ID", input.env);
  const redirectUri = `${siteUrl(input.env)}/api/testnet-tester/oauth/x/callback`;
  const body = new URLSearchParams({
    code: input.code,
    grant_type: "authorization_code",
    client_id: clientId,
    redirect_uri: redirectUri,
    code_verifier: input.verifier,
  });

  const headers: Record<string, string> = {
    "content-type": "application/x-www-form-urlencoded",
    accept: "application/json",
  };
  const clientSecret = String(input.env.X_OAUTH_CLIENT_SECRET ?? "").trim();
  if (clientSecret) {
    headers.authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
  }

  const response = await fetch("https://api.x.com/2/oauth2/token", {
    method: "POST",
    headers,
    body,
  });
  if (!response.ok) throw new Error("X_OAUTH_TOKEN_EXCHANGE_FAILED");
  const payload = (await response.json()) as { access_token?: unknown };
  const accessToken = typeof payload.access_token === "string" ? payload.access_token : "";
  if (!accessToken) throw new Error("X_OAUTH_TOKEN_MISSING");

  const me = await fetch("https://api.x.com/2/users/me", {
    headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
  });
  if (!me.ok) throw new Error("X_OAUTH_IDENTITY_LOOKUP_FAILED");
  const identity = (await me.json()) as { data?: { id?: unknown } };
  const id = typeof identity.data?.id === "string" ? identity.data.id : "";
  if (!id) throw new Error("X_OAUTH_IDENTITY_MISSING");
  return id;
}

async function exchangeDiscordCode(input: {
  code: string;
  env: Record<string, string | undefined>;
}) {
  const clientId = requireEnv("DISCORD_OAUTH_CLIENT_ID", input.env);
  const clientSecret = requireEnv("DISCORD_OAUTH_CLIENT_SECRET", input.env);
  const redirectUri = `${siteUrl(input.env)}/api/testnet-tester/oauth/discord/callback`;

  const token = await fetch("https://discord.com/api/v10/oauth2/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code: input.code,
      redirect_uri: redirectUri,
    }),
  });
  if (!token.ok) throw new Error("DISCORD_OAUTH_TOKEN_EXCHANGE_FAILED");
  const payload = (await token.json()) as { access_token?: unknown };
  const accessToken = typeof payload.access_token === "string" ? payload.access_token : "";
  if (!accessToken) throw new Error("DISCORD_OAUTH_TOKEN_MISSING");

  const me = await fetch("https://discord.com/api/v10/users/@me", {
    headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
  });
  if (!me.ok) throw new Error("DISCORD_OAUTH_IDENTITY_LOOKUP_FAILED");
  const identity = (await me.json()) as { id?: unknown };
  const id = typeof identity.id === "string" ? identity.id : "";
  if (!id) throw new Error("DISCORD_OAUTH_IDENTITY_MISSING");
  return id;
}

export async function completeTesterOauthCallback(input: {
  event: H3Event;
  principalId: string;
  provider: TesterOauthProvider;
  code: string;
  state: string;
  env?: Record<string, string | undefined>;
}) {
  const rawCookie = String(getCookie(input.event, cookieName(input.provider)) ?? "").trim();
  const cookie = rawCookie ? decodeOauthCookie(rawCookie) : null;
  if (!cookie || !cookie.state || cookie.state !== input.state) {
    throw new Error("OAUTH_BROWSER_STATE_MISMATCH");
  }

  const env = input.env ?? process.env;
  let providerAccountId: string;
  if (input.provider === "x") {
    if (!cookie.verifier) throw new Error("X_OAUTH_PKCE_VERIFIER_MISSING");
    providerAccountId = await exchangeXCode({
      code: input.code,
      verifier: cookie.verifier,
      env,
    });
  } else {
    providerAccountId = await exchangeDiscordCode({ code: input.code, env });
  }

  await consumeTesterOauthIdentity({
    principalId: input.principalId,
    provider: input.provider,
    state: input.state,
    providerAccountId,
  });
  clearTesterOauthCookie(input.event, input.provider);
  return { connected: true, provider: input.provider } as const;
}
