import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ownerAuth = readFileSync(
  join(process.cwd(), "scripts/ops/private-ledger-owner-auth.mjs"),
  "utf8",
);
const exportScript = readFileSync(
  join(process.cwd(), "scripts/ops/export-private-commercial-revenue-ledger.mjs"),
  "utf8",
);
const backupScript = readFileSync(
  join(process.cwd(), "scripts/ops/backup-private-commercial-revenue-ledger.mjs"),
  "utf8",
);
const verifyBackupScript = readFileSync(
  join(process.cwd(), "scripts/ops/verify-private-commercial-revenue-ledger-backup.mjs"),
  "utf8",
);

describe("private revenue ledger owner-only operations", () => {
  it("requires a separate owner token and explicit per-action acknowledgement", () => {
    expect(ownerAuth).toContain("GEOMACRO_PRIVATE_LEDGER_OWNER_TOKEN");
    expect(ownerAuth).toContain("GEOMACRO_PRIVATE_LEDGER_OWNER_TOKEN_SHA256");
    expect(ownerAuth).toContain("GEOMACRO_PRIVATE_LEDGER_OWNER_ACK");
    expect(ownerAuth).toContain("timingSafeEqual");
    expect(ownerAuth).toContain("I_AM_THE_GEOMACRO_OWNER_AND_AUTHORIZE_PRIVATE_LEDGER_");
  });

  it("keeps full private exports outside the repository and owner-gated", () => {
    expect(exportScript).toContain('assertPrivateLedgerOwnerAuthorization("EXPORT")');
    expect(exportScript).toContain("assertPathOutsideRepository");
    expect(exportScript).toContain("intended_for_public_sharing: false");
    expect(exportScript).toContain("no export was uploaded or published by this script");
    expect(exportScript).not.toContain("actions/upload-artifact");
  });

  it("creates authenticated encrypted local backups without persisting plaintext backup content", () => {
    expect(backupScript).toContain('assertPrivateLedgerOwnerAuthorization("BACKUP")');
    expect(backupScript).toContain('createCipheriv("aes-256-gcm"');
    expect(backupScript).toContain("scryptSync");
    expect(backupScript).toContain("github_artifact_upload_authorized: false");
    expect(backupScript).toContain("plaintext_persisted_in_backup: false");
    expect(backupScript).toContain("GEOMACRO_PRIVATE_LEDGER_DELETE_PLAINTEXT_AFTER_BACKUP");
    expect(backupScript).toContain("no private evidence was uploaded, published, or written inside the repository");
    expect(backupScript).not.toContain("fetch(");
    expect(backupScript).not.toContain("actions/upload-artifact");
  });

  it("verifies encrypted backup authentication, source digest and offline ledger links in memory only", () => {
    expect(verifyBackupScript).toContain(
      'assertPrivateLedgerOwnerAuthorization("VERIFY_BACKUP")',
    );
    expect(verifyBackupScript).toContain('createDecipheriv("aes-256-gcm"');
    expect(verifyBackupScript).toContain("decipher.setAuthTag");
    expect(verifyBackupScript).toContain("Offline ledger-link verification failed");
    expect(verifyBackupScript).toContain(
      "decrypted private evidence remained in memory and was not written or uploaded",
    );
    expect(verifyBackupScript).not.toContain("writeFile");
    expect(verifyBackupScript).not.toContain("fetch(");
  });
});
