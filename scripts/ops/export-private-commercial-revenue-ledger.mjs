import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { assertPathOutsideRepository, assertPrivateLedgerOwnerAuthorization } from "./private-ledger-owner-auth.mjs";

const PROD_PROJECT_REF = "ldpwajisioljyjtojvfx";
const PAGE_SIZE = 500;

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
  assertPrivateLedgerOwnerAuthorization("EXPORT");

  const url = required("APP_SUPABASE_URL");
  const key = required("APP_SUPABASE_SERVICE_ROLE_KEY");
  const target = new URL(url);
  const projectRef = target.hostname.split(".")[0];
  if (target.protocol !== "https:" || projectRef !== PROD_PROJECT_REF) {
    fail("Private revenue-ledger export must target the authoritative Geomacro production project");
  }

  const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: verification, error: verificationError } = await db.rpc(
    "verify_private_commercial_revenue_delivery_ledger",
  );
  if (verificationError) throw verificationError;

  const verificationRows = Array.isArray(verification) ? verification : [];
  const invalid = verificationRows.filter(
    (row) => row?.previous_link_valid !== true || row?.entry_hash_valid !== true,
  );
  if (invalid.length > 0) {
    fail(`Private revenue ledger hash-chain verification failed for ${invalid.length} row(s)`);
  }

  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await db
      .from("private_commercial_revenue_delivery_ledger")
      .select("*")
      .order("sequence_no", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = Array.isArray(data) ? data : [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  if (rows.length !== verificationRows.length) {
    fail(
      `Ledger/export row-count mismatch: ledger=${rows.length}, verifier=${verificationRows.length}`,
    );
  }

  for (let i = 0; i < rows.length; i += 1) {
    if (String(rows[i]?.entry_sha256 ?? "") !== String(verificationRows[i]?.stored_entry_sha256 ?? "")) {
      fail(`Ledger/verifier ordering mismatch at export index ${i}`);
    }
  }

  const head = rows.length > 0 ? rows.at(-1) : null;
  const providerCounts = {};
  const assetAtomicTotals = {};

  for (const row of rows) {
    const provider = String(row.provider ?? "unknown");
    providerCounts[provider] = (providerCounts[provider] ?? 0) + 1;

    const asset = String(row.asset_symbol ?? "UNKNOWN");
    const amount = row.amount_atomic === null || row.amount_atomic === undefined
      ? 0n
      : BigInt(String(row.amount_atomic));
    assetAtomicTotals[asset] = (BigInt(assetAtomicTotals[asset] ?? "0") + amount).toString();
  }

  const generatedAt = new Date().toISOString();
  const fullExport = {
    schema_version: "geomacro.private-commercial-revenue-ledger-export.v1",
    generated_at: generatedAt,
    project_ref: PROD_PROJECT_REF,
    private_internal_only: true,
    public_distribution_authorized: false,
    row_count: rows.length,
    head_entry_sha256: head?.entry_sha256 ?? null,
    first_sequence_no: rows[0]?.sequence_no ?? null,
    last_sequence_no: head?.sequence_no ?? null,
    hash_chain_verified: invalid.length === 0,
    rows,
    export_boundaries: {
      contains_private_delivery_snapshots: true,
      contains_raw_payment_signatures: false,
      contains_private_keys: false,
      contains_api_credentials: false,
      contains_auth_headers: false,
      intended_for_public_sharing: false,
    },
  };

  const fullExportText = JSON.stringify(fullExport, null, 2) + "\n";
  const fullExportSha256 = sha256(fullExportText);

  const checkpoint = {
    schema_version: "geomacro.private-commercial-revenue-ledger-checkpoint.v1",
    generated_at: generatedAt,
    project_ref: PROD_PROJECT_REF,
    row_count: rows.length,
    first_sequence_no: rows[0]?.sequence_no ?? null,
    last_sequence_no: head?.sequence_no ?? null,
    head_entry_sha256: head?.entry_sha256 ?? null,
    full_export_sha256: fullExportSha256,
    hash_chain_verified: invalid.length === 0,
    provider_counts: providerCounts,
    asset_atomic_totals: assetAtomicTotals,
    private_delivery_snapshots_included: false,
    customer_identity_included: false,
    raw_settlement_reference_included: false,
    public_distribution_authorized: false,
  };

  const stamp = generatedAt.replace(/[:.]/g, "-");
  const output =
    String(process.env.GEOMACRO_PRIVATE_REVENUE_LEDGER_EXPORT_PATH ?? "").trim() ||
    `/tmp/geomacro-private-revenue-ledger-${stamp}.json`;
  const checkpointPath =
    String(process.env.GEOMACRO_PRIVATE_REVENUE_LEDGER_CHECKPOINT_PATH ?? "").trim() ||
    `${output}.checkpoint.json`;

  const safeOutput = assertPathOutsideRepository(output, "Private revenue ledger export path");
  const safeCheckpointPath = assertPathOutsideRepository(checkpointPath, "Private revenue ledger checkpoint path");
  if (safeOutput === safeCheckpointPath) fail("Private export and checkpoint paths must differ");

  await mkdir(path.dirname(safeOutput), { recursive: true });
  await mkdir(path.dirname(safeCheckpointPath), { recursive: true });
  await writeFile(safeOutput, fullExportText, { mode: 0o600 });
  await writeFile(safeCheckpointPath, JSON.stringify(checkpoint, null, 2) + "\n", {
    mode: 0o600,
  });

  console.log("PASS: private commercial revenue delivery ledger exported with verified hash chain.");
  console.log(`Rows: ${rows.length}`);
  console.log(`Head: ${head?.entry_sha256 ?? "GENESIS"}`);
  console.log(`Full private export: ${safeOutput}`);
  console.log(`Checkpoint: ${safeCheckpointPath}`);
  console.log("BOUNDARY: no export was uploaded or published by this script.");
}

main().catch((error) => {
  console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
