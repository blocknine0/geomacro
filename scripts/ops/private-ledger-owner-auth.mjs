import { createHash, timingSafeEqual } from "node:crypto";
import path from "node:path";

function fail(message) {
  throw new Error(message);
}

function required(name) {
  const value = String(process.env[name] ?? "").trim();
  if (!value) fail(`${name} is required`);
  return value;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function assertPrivateLedgerOwnerAuthorization(action) {
  const normalizedAction = String(action ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9_]{3,48}$/.test(normalizedAction)) {
    fail("Private-ledger owner action is invalid");
  }

  const token = required("GEOMACRO_PRIVATE_LEDGER_OWNER_TOKEN");
  const expectedHash = required("GEOMACRO_PRIVATE_LEDGER_OWNER_TOKEN_SHA256").toLowerCase();
  const ack = required("GEOMACRO_PRIVATE_LEDGER_OWNER_ACK");
  const expectedAck = `I_AM_THE_GEOMACRO_OWNER_AND_AUTHORIZE_PRIVATE_LEDGER_${normalizedAction}`;

  if (token.length < 32) {
    fail("GEOMACRO_PRIVATE_LEDGER_OWNER_TOKEN must be at least 32 characters");
  }
  if (!/^[0-9a-f]{64}$/.test(expectedHash)) {
    fail("GEOMACRO_PRIVATE_LEDGER_OWNER_TOKEN_SHA256 must be a sha256 hex digest");
  }

  const actual = Buffer.from(sha256(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  if (!timingSafeEqual(actual, expected)) {
    fail("Private-ledger owner authorization token mismatch");
  }
  if (ack !== expectedAck) {
    fail(`GEOMACRO_PRIVATE_LEDGER_OWNER_ACK must equal ${expectedAck}`);
  }

  return { action: normalizedAction, authorized: true };
}

export function assertPathOutsideRepository(candidate, label) {
  const resolved = path.resolve(String(candidate ?? ""));
  const repoRoot = path.resolve(process.cwd());
  if (!path.isAbsolute(resolved)) {
    fail(`${label} must resolve to an absolute path`);
  }
  const relative = path.relative(repoRoot, resolved);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    fail(`${label} must stay outside the repository working tree`);
  }
  return resolved;
}
