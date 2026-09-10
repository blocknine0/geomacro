import {
  deleteCookie,
  getCookie,
  getHeader,
  setCookie,
  type H3Event,
} from "h3";

export const TESTNET_TESTER_SESSION_COOKIE = "__Host-geomacro_test_session";

const MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

export function setTesterSessionCookie(event: H3Event, token: string) {
  setCookie(event, TESTNET_TESTER_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export function clearTesterSessionCookie(event: H3Event) {
  deleteCookie(event, TESTNET_TESTER_SESSION_COOKIE, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
  });
}

export function testerSessionTokenFromRequest(event: H3Event) {
  const cookie = String(getCookie(event, TESTNET_TESTER_SESSION_COOKIE) ?? "").trim();
  if (cookie) return cookie;

  const authorization = String(getHeader(event, "authorization") ?? "").trim();
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}
