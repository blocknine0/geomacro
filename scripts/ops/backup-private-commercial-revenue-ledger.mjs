import {
  createCipheriv,
  createHash,
  randomBytes,
  scryptSync,
} from "node:crypto";
import {
  mkdir,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import {
  assertPathOutsideRepository,
  assertPrivateLedgerOwnerAuthorization,
} from "./private-ledger-owner-auth.mjs";

const MAX_EXPORT_BYTES = 512 * 1024 * 1024;
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

async function atomicWrite(file, data, mode = 0o600) {
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tmp, data, { mode });
  await rename(tmp, file);
}

async function main() {
  assertPrivateLedgerOwnerAuthorization("BACKUP");

  const exportPath = assertPathOutsideRepository(
    required("GEOMACRO_PRIVATE_REVENUE_LEDGER_EXPORT_PATH"),
    "Private revenue ledger export path",
  );
  const checkpointPath = assertPathOutsideRepository(
    required("GEOMACRO_PRIVATE_REVENUE_LEDGER_CHECKPOINT_PATH"),
    "Private revenue ledger checkpoint path",
  );
  const backupDir = assertPathOutsideRepository(
    required("GEOMACRO_PRIVATE_REVENUE_LEDGER_BACKUP_DIR"),
    "Private revenue ledger backup directory",
  );
  const passphrase = required("GEOMACRO_PRIVATE_LEDGER_BACKUP_PASSPHRASE");
  if (passphrase.length < 24) {
    fail("GEOMACRO_PRIVATE_LEDGER_BACKUP_PASSPHRASE must be at least 24 characters");
  }

  const info = await stat(exportPath);
  if (!info.isFile() || info.size <= 0 || info.size > MAX_EXPORT_BYTES) {
    fail("Private ledger export is empty, not a file, or exceeds the 512 MiB owner-backup limit");
  }

  const [plaintext, checkpointText] = await Promise.all([
    readFile(exportPath),
    readFile(checkpointPath, "utf8"),
  ]);

  let checkpoint;
  let exported;
  try {
    checkpoint = JSON.parse(checkpointText);
    exported = JSON.parse(plaintext.toString("utf8"));
  } catch {
    fail("Private ledger export/checkpoint is not valid JSON");
  }

  if (exported?.schema_version !== "geomacro.private-commercial-revenue-ledger-export.v1") {
    fail("Private ledger export schema mismatch");
  }
  if (checkpoint?.schema_version !== "geomacro.private-commercial-revenue-ledger-checkpoint.v1") {
    fail("Private ledger checkpoint schema mismatch");
  }
  if (exported?.private_internal_only !== true || exported?.public_distribution_authorized !== false) {
    fail("Private ledger export boundary mismatch");
  }
  if (exported?.hash_chain_verified !== true || checkpoint?.hash_chain_verified !== true) {
    fail("Refusing to back up an unverified private ledger export");
  }

  const exportSha = sha256(plaintext);
  if (exportSha !== String(checkpoint?.full_export_sha256 ?? "").toLowerCase()) {
    fail("Private ledger export digest does not match its checkpoint");
  }
  if (Number(exported?.row_count) !== Number(checkpoint?.row_count)) {
    fail("Private ledger export/checkpoint row count mismatch");
  }
  if (
    String(exported?.head_entry_sha256 ?? "") !==
    String(checkpoint?.head_entry_sha256 ?? "")
  ) {
    fail("Private ledger export/checkpoint head hash mismatch");
  }

  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = scryptSync(passphrase, salt, 32, {
    N: 32768,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(AAD);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const generatedAt = new Date().toISOString();
  const stamp = generatedAt.replace(/[:.]/g, "-");
  const envelope = {
    schema_version: "geomacro.private-commercial-revenue-ledger-encrypted-backup.v1",
    generated_at: generatedAt,
    encryption: {
      algorithm: "aes-256-gcm",
      kdf: "scrypt",
      scrypt_N: 32768,
      scrypt_r: 8,
      scrypt_p: 1,
      salt_b64: salt.toString("base64"),
      iv_b64: iv.toString("base64"),
      auth_tag_b64: authTag.toString("base64"),
      aad: AAD.toString("utf8"),
    },
    source: {
      export_sha256: exportSha,
      row_count: Number(checkpoint.row_count),
      first_sequence_no: checkpoint.first_sequence_no ?? null,
      last_sequence_no: checkpoint.last_sequence_no ?? null,
      head_entry_sha256: checkpoint.head_entry_sha256 ?? null,
      database_hash_chain_verified: true,
    },
    ciphertext_b64: ciphertext.toString("base64"),
    boundaries: {
      plaintext_persisted_in_backup: false,
      raw_credentials_included: false,
      public_distribution_authorized: false,
      github_artifact_upload_authorized: false,
    },
  };

  const envelopeText = JSON.stringify(envelope, null, 2) + "\n";
  const envelopeSha = sha256(envelopeText);

  const manifest = {
    schema_version: "geomacro.private-commercial-revenue-ledger-backup-manifest.v1",
    generated_at: generatedAt,
    encrypted_backup_sha256: envelopeSha,
    source_export_sha256: exportSha,
    row_count: Number(checkpoint.row_count),
    first_sequence_no: checkpoint.first_sequence_no ?? null,
    last_sequence_no: checkpoint.last_sequence_no ?? null,
    head_entry_sha256: checkpoint.head_entry_sha256 ?? null,
    database_hash_chain_verified: true,
    encrypted_at_rest: true,
    owner_authorization_required: true,
    contains_private_delivery_payload: false,
    contains_raw_settlement_reference: false,
    public_distribution_authorized: false,
    github_artifact_upload_authorized: false,
  };

  await mkdir(backupDir, { recursive: true, mode: 0o700 });
  const backupPath = path.join(
    backupDir,
    `geomacro-private-revenue-ledger-${stamp}.enc.json`,
  );
  const manifestPath = `${backupPath}.manifest.json`;

  await atomicWrite(backupPath, envelopeText);
  await atomicWrite(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

  const deletePlaintext =
    String(process.env.GEOMACRO_PRIVATE_LEDGER_DELETE_PLAINTEXT_AFTER_BACKUP ?? "true")
      .trim()
      .toLowerCase() !== "false";

  if (deletePlaintext) {
    await Promise.all([
      unlink(exportPath).catch((error) => {
        if (error?.code !== "ENOENT") throw error;
      }),
      unlink(checkpointPath).catch((error) => {
        if (error?.code !== "ENOENT") throw error;
      }),
    ]);
  }

  console.log("PASS: encrypted owner-only private revenue ledger backup created.");
  console.log(`Rows: ${manifest.row_count}`);
  console.log(`Head: ${manifest.head_entry_sha256 ?? "GENESIS"}`);
  console.log(`Encrypted backup: ${backupPath}`);
  console.log(`Sanitized manifest: ${manifestPath}`);
  console.log(`Plaintext export deleted: ${deletePlaintext}`);
  console.log("BOUNDARY: no private evidence was uploaded, published, or written inside the repository.");
}

main().catch((error) => {
  console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
