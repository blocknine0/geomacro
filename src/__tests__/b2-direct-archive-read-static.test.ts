import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("#1414 B2 direct archive and credential split", () => {
  it("uses dedicated read credentials for GET without changing PUT credentials", () => {
    const client = read("scripts/ops/b2-s3-client.mjs");

    expect(client).toContain("B2_ARCHIVE_READ_KEY_ID");
    expect(client).toContain("B2_ARCHIVE_READ_APPLICATION_KEY");
    expect(client).toContain("B2_ARCHIVE_WRITE_KEY_ID");
    expect(client).toContain("B2_ARCHIVE_WRITE_APPLICATION_KEY");
    expect(client).toContain('[explicitReadAccessKey, explicitReadSecretKey, "explicit-read"]');
    expect(client).toContain('[dedicatedReadAccessKey, dedicatedReadSecretKey, "dedicated-read"]');
    expect(client).toContain('[archiveWriteAccessKey, archiveWriteSecretKey, "archive-read-write"]');
    expect(client).toContain("B2_ARCHIVE_READ_CREDENTIAL_PAIR_INCOMPLETE");
    expect(client).toContain('method === "GET"');
    expect(client).toContain('"dedicated-read"');
    expect(client).toContain('"archive-read-write"');
    expect(client).toContain('role: "primary"');
    expect(client).toContain('errorCode === "AccessDenied"');
    expect(client).toContain("credentialIndex < credentialCandidates.length - 1");
    expect(client).toContain("read_credentials_separate: readCredentialsSeparate");
    expect(client).toContain("read_fallback_to_primary_available");
  });

  it("makes direct-Postgres archived GRO recovery B2-native", () => {
    const archive = read("src/lib/risk-object-archive.server.ts");
    const helper = read("src/lib/b2-private-archive-read.server.ts");
    const store = read("src/lib/risk-object-store.server.ts");

    expect(archive).toContain("if (directPostgresMode())");
    expect(archive).toContain("return downloadDirectB2Archive(row)");
    expect(archive).toContain("geomacro-evidence/v1/gro/");
    expect(archive).toContain("geomacro.gro-bundle.v1");
    expect(archive).toContain("archive_bundle_key");
    expect(archive).toContain("archive_bundle_sha256");
    expect(helper).toContain("B2_ARCHIVE_READ_KEY_ID");
    expect(helper).toContain("B2_ARCHIVE_READ_APPLICATION_KEY");
    expect(helper).toContain("B2_ARCHIVE_WRITE_KEY_ID");
    expect(helper).toContain("B2_ARCHIVE_WRITE_APPLICATION_KEY");
    expect(helper).toContain('"dedicated-read"');
    expect(helper).toContain('"archive-read-write"');
    expect(helper).toContain('"primary"');
    expect(helper).toContain("B2_ARCHIVE_READ_CREDENTIAL_PAIR_INCOMPLETE");
    expect(helper).toContain('const B2_NATIVE_AUTHORIZE_URL = "https://api.backblazeb2.com/b2api/v4/b2_authorize_account"');
    expect(helper).toContain('capabilities.includes("readFiles")');
    expect(helper).toContain('buckets.includes(B2_BUCKET)');
    expect(helper).toContain("authorization.namePrefix");
    expect(helper).toContain("B2_DOWNLOAD_CAP_EXCEEDED");
    expect(helper).toContain('const B2_BUCKET = "geomacro-private-archive"');
    expect(store).toContain("archive_bundle_key,archive_bundle_sha256");
  });

  it("wires dedicated read credentials into the launch-critical workflows", () => {
    for (const path of [
      ".github/workflows/b2-country-gro-continuity.yml",
      ".github/workflows/intelligence-scored-refresh.yml",
      ".github/workflows/intelligence-fastlane-publication.yml",
      ".github/workflows/day7-final-commercial-launch-gate.yml",
    ]) {
      const workflow = read(path);
      expect(workflow).toContain(
        "B2_ARCHIVE_READ_KEY_ID: ${{ secrets.B2_ARCHIVE_READ_KEY_ID }}",
      );
      expect(workflow).toContain(
        "B2_ARCHIVE_READ_APPLICATION_KEY: ${{ secrets.B2_ARCHIVE_READ_APPLICATION_KEY }}",
      );
    }

    const intelligenceRefresh = read(".github/workflows/intelligence-scored-refresh.yml");
    const fastlanePublication = read(".github/workflows/intelligence-fastlane-publication.yml");
    for (const workflow of [intelligenceRefresh, fastlanePublication]) {
      expect(workflow).toContain('test -n "${B2_ARCHIVE_READ_KEY_ID:-}"');
      expect(workflow).toContain('test -n "${B2_ARCHIVE_READ_APPLICATION_KEY:-}"');
      expect(workflow).toContain("mandatory readback");
    }
    expect(intelligenceRefresh).toContain(
      "B2_ARCHIVE_WRITE_KEY_ID: ${{ secrets.B2_ARCHIVE_WRITE_KEY_ID }}",
    );
    expect(intelligenceRefresh).toContain(
      "B2_ARCHIVE_WRITE_APPLICATION_KEY: ${{ secrets.B2_ARCHIVE_WRITE_APPLICATION_KEY }}",
    );

    const countryContinuity = read(".github/workflows/b2-country-gro-continuity.yml");
    expect(countryContinuity).toContain(
      "B2_ARCHIVE_WRITE_KEY_ID: ${{ secrets.B2_ARCHIVE_WRITE_KEY_ID }}",
    );
    expect(countryContinuity).toContain(
      "B2_ARCHIVE_WRITE_APPLICATION_KEY: ${{ secrets.B2_ARCHIVE_WRITE_APPLICATION_KEY }}",
    );
  });

  it("lets the production B2 serving path prefer the read-only key pair", () => {
    const live = read("src/lib/b2-live.server.ts");
    expect(live).toContain("process.env.B2_ARCHIVE_READ_KEY_ID");
    expect(live).toContain("process.env.B2_ARCHIVE_READ_APPLICATION_KEY");
    expect(live).toContain(
      'const accessKey = dedicatedAccessKey || String(process.env.B2_KEY_ID ?? "").trim();',
    );
    expect(live).toContain(
      'const secretKey = dedicatedSecretKey || String(process.env.B2_APPLICATION_KEY ?? "").trim();',
    );
  });
});
