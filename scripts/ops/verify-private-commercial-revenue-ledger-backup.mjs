import {
  createDecipheriv,
  createHash,
  scryptSync,
} from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  assertPathOutsideRepository,
  assertPrivateLedgerOwnerAuthorization,
} from "./private-ledger-owner-auth.mjs";

const AAD = Buffer.from("geomacro.private-commercial-revenue-ledger-backup.v1", "utf8");

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

async function main() {
  assertPrivateLedgerOwnerAuthorization("VERIFY_BACKUP");

  const backupPath = assertPathOutsideRepository(
    required("GEOMACRO_PRIVATE_REVENUE_LEDGER_BACKUP_PATH"),
    "Private revenue ledger backup path",
  );
  const manifestPath = assertPathOutsideRepository(
    required("GEOMACRO_PRIVATE_REVENUE_LEDGER_BACKUP_MANIFEST_PATH"),
    "Private revenue ledger backup manifest path",
  );
  const passphrase = required("GEOMACRO_PRIVATE_LEDGER_BACKUP_PASSPHRASE");
  if (passphrase.length < 24) {
    fail("GEOMACRO_PRIVATE_LEDGER_BACKUP_PASSPHRASE must be at least 24 characters");
  }

  const [envelopeText, manifestText] = await Promise.all([
    readFile(backupPath, "utf8"),
    readFile(manifestPath, "utf8"),
  ]);

  let envelope;
  let manifest;
  try {
    envelope = JSON.parse(envelopeText);
    manifest = JSON.parse(manifestText);
  } catch {
    fail("Backup envelope/manifest is not valid JSON");
  }

  if (
    envelope?.schema_version !==
    "geomacro.private-commercial-revenue-ledger-encrypted-backup.v1"
  ) {
    fail("Encrypted backup schema mismatch");
  }
  if (
    manifest?.schema_version !==
    "geomacro.private-commercial-revenue-ledger-backup-manifest.v1"
  ) {
    fail("Backup manifest schema mismatch");
  }

  const envelopeSha = sha256(envelopeText);
  if (envelopeSha !== String(manifest?.encrypted_backup_sha256 ?? "").toLowerCase()) {
    fail("Encrypted backup digest does not match manifest");
  }

  if (
    envelope?.encryption?.algorithm !== "aes-256-gcm" ||
    envelope?.encryption?.kdf !== "scrypt" ||
    envelope?.encryption?.aad !== AAD.toString("utf8")
  ) {
    fail("Encrypted backup cryptographic contract mismatch");
  }
  if (
    envelope?.boundaries?.plaintext_persisted_in_backup !== false ||
    envelope?.boundaries?.public_distribution_authorized !== false ||
    envelope?.boundaries?.github_artifact_upload_authorized !== false
  ) {
    fail("Encrypted backup privacy boundary mismatch");
  }

  const salt = Buffer.from(String(envelope.encryption.salt_b64 ?? ""), "base64");
  const iv = Buffer.from(String(envelope.encryption.iv_b64 ?? ""), "base64");
  const tag = Buffer.from(String(envelope.encryption.auth_tag_b64 ?? ""), "base64");
  const ciphertext = Buffer.from(String(envelope.ciphertext_b64 ?? ""), "base64");
  if (salt.length !== 16 || iv.length !== 12 || tag.length !== 16 || ciphertext.length === 0) {
    fail("Encrypted backup parameters are invalid");
  }

  const key = scryptSync(passphrase, salt, 32, {
    N: Number(envelope.encryption.scrypt_N),
    r: Number(envelope.encryption.scrypt_r),
    p: Number(envelope.encryption.scrypt_p),
    maxmem: 64 * 1024 * 1024,
  });
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(AAD);
  decipher.setAuthTag(tag);

  let plaintext;
  try {
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    fail("Encrypted backup authentication/decryption failed");
  }

  const sourceSha = sha256(plaintext);
  if (
    sourceSha !== String(envelope?.source?.export_sha256 ?? "").toLowerCase() ||
    sourceSha !== String(manifest?.source_export_sha256 ?? "").toLowerCase()
  ) {
    fail("Decrypted private export digest mismatch");
  }

  let exported;
  try {
    exported = JSON.parse(plaintext.toString("utf8"));
  } catch {
    fail("Decrypted private export is not valid JSON");
  }

  if (exported?.schema_version !== "geomacro.private-commercial-revenue-ledger-export.v1") {
    fail("Decrypted private export schema mismatch");
  }
  if (exported?.private_internal_only !== true || exported?.public_distribution_authorized !== false) {
    fail("Decrypted private export boundary mismatch");
  }
  if (exported?.hash_chain_verified !== true) {
    fail("Decrypted private export was not database hash-chain verified");
  }
  if (
    Number(exported?.row_count) !== Number(manifest?.row_count) ||
    String(exported?.head_entry_sha256 ?? "") !== String(manifest?.head_entry_sha256 ?? "")
  ) {
    fail("Decrypted private export does not match backup manifest checkpoint");
  }

  const rows = Array.isArray(exported?.rows) ? exported.rows : [];
  if (rows.length !== Number(exported.row_count)) {
    fail("Decrypted private export row count is inconsistent");
  }

  let previous = null;
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i] ?? {};
    const expectedPrevious = i === 0 ? null : previous;
    if ((row.previous_entry_sha256 ?? null) !== expectedPrevious) {
      fail(`Offline ledger-link verification failed at row index ${i}`);
    }
    if (!/^[0-9a-f]{64}$/.test(String(row.entry_sha256 ?? ""))) {
      fail(`Offline ledger entry hash format failed at row index ${i}`);
    }
    previous = row.entry_sha256;
  }

  if ((previous ?? null) !== (exported.head_entry_sha256 ?? null)) {
    fail("Offline ledger head-link verification failed");
  }

  console.log("PASS: owner-only encrypted private revenue ledger backup verified.");
  console.log(`Rows: ${rows.length}`);
  console.log(`Head: ${exported.head_entry_sha256 ?? "GENESIS"}`);
  console.log("BOUNDARY: decrypted private evidence remained in memory and was not written or uploaded.");
}

main().catch((error) => {
  console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
