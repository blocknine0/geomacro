import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { requireRiskSupabase } from "./risk-supabase.server";
import { verifyRiskObjectSignature } from "./risk-object-signing.server";
import {
  b2PrivateArchiveReadConfigured,
  readPrivateB2Object,
} from "./b2-private-archive-read.server";
import type { GeomacroRiskObject } from "./risk-object-contract";

type ArchivedRiskObjectRow = {
  object_id: string;
  payload: unknown;
  payload_hash?: string | null;
  archive_key?: string | null;
  archive_sha256?: string | null;
  archive_bundle_key?: string | null;
  archive_bundle_sha256?: string | null;
};

type GroBundle = {
  schema?: string;
  entries?: Array<{
    object_id?: string;
    archive_sha256?: string;
    archive_gzip_b64?: string;
  }>;
};

const sha256 = (value: Buffer | string) =>
  createHash("sha256").update(value).digest("hex");

function directPostgresMode() {
  return String(process.env.GRI_DB_MODE ?? "").trim().toLowerCase() === "direct_postgres";
}

async function downloadEdgeArchive(objectId: string): Promise<Buffer> {
  const db = requireRiskSupabase();
  const { data, error } = await db.functions.invoke("gro-archive-read", {
    body: { object_id: objectId },
  });
  if (error || !(data instanceof Blob)) throw new Error("RISK_OBJECT_ARCHIVE_UNAVAILABLE");
  return Buffer.from(await data.arrayBuffer());
}

async function downloadLegacyStorageArchive(archiveKey: string): Promise<Buffer> {
  const db = requireRiskSupabase();
  const { data, error } = await db.storage
    .from("geomacro-live-intelligence")
    .download(archiveKey);
  if (error || !data) throw new Error("RISK_OBJECT_ARCHIVE_UNAVAILABLE");
  return Buffer.from(await data.arrayBuffer());
}

function validateArchivedRow(row: ArchivedRiskObjectRow) {
  if (
    !/^gro_[A-Za-z0-9_]+$/.test(row.object_id) ||
    row.archive_key !== `risk-object-archive/v1/${row.object_id}.json.gz` ||
    !/^[a-f0-9]{64}$/.test(row.payload_hash ?? "") ||
    !/^[a-f0-9]{64}$/.test(row.archive_sha256 ?? "")
  ) {
    throw new Error("RISK_OBJECT_ARCHIVE_POINTER_INVALID");
  }
}

async function downloadDirectB2Archive(row: ArchivedRiskObjectRow): Promise<Buffer> {
  validateArchivedRow(row);

  if (row.archive_bundle_key) {
    if (
      !/^geomacro-evidence\/v1\/gro-bundles\/[0-9]{8}T[0-9]{6}Z-[0-9a-f]-[0-9a-f-]{36}\.json\.gz$/.test(
        row.archive_bundle_key,
      ) ||
      !/^[a-f0-9]{64}$/.test(row.archive_bundle_sha256 ?? "")
    ) {
      throw new Error("RISK_OBJECT_ARCHIVE_BUNDLE_POINTER_INVALID");
    }

    const packed = await readPrivateB2Object(row.archive_bundle_key, {
      maxBytes: 20_000_000,
    });
    if (sha256(packed) !== row.archive_bundle_sha256) {
      throw new Error("RISK_OBJECT_ARCHIVE_BUNDLE_HASH_MISMATCH");
    }

    const decodedBundle = gunzipSync(packed, {
      maxOutputLength: 40_000_000,
    });
    const bundle = JSON.parse(decodedBundle.toString("utf8")) as GroBundle;
    if (bundle.schema !== "geomacro.gro-bundle.v1" || !Array.isArray(bundle.entries)) {
      throw new Error("RISK_OBJECT_ARCHIVE_BUNDLE_SHAPE_INVALID");
    }

    const member = bundle.entries.find((entry) => entry.object_id === row.object_id);
    if (
      !member ||
      member.archive_sha256 !== row.archive_sha256 ||
      typeof member.archive_gzip_b64 !== "string"
    ) {
      throw new Error("RISK_OBJECT_ARCHIVE_BUNDLE_MEMBER_INVALID");
    }

    const compressed = Buffer.from(member.archive_gzip_b64, "base64");
    if (sha256(compressed) !== row.archive_sha256) {
      throw new Error("RISK_OBJECT_ARCHIVE_BUNDLE_MEMBER_HASH_MISMATCH");
    }
    return compressed;
  }

  const compressed = await readPrivateB2Object(
    `geomacro-evidence/v1/gro/${row.object_id}.json.gz`,
    { maxBytes: 2_000_000 },
  );
  if (sha256(compressed) !== row.archive_sha256) {
    throw new Error("RISK_OBJECT_ARCHIVE_HASH_MISMATCH");
  }
  return compressed;
}

async function downloadArchivedPayload(row: ArchivedRiskObjectRow): Promise<Buffer> {
  if (directPostgresMode()) {
    // Direct-Postgres production recovery must not call Supabase Edge or Storage.
    // B2 is the durable payload authority and the only archive dependency here.
    return downloadDirectB2Archive(row);
  }

  if (b2PrivateArchiveReadConfigured()) {
    try {
      return await downloadDirectB2Archive(row);
    } catch {
      // Legacy non-direct runtimes may still use the verified Supabase bridge
      // while B2 read credentials are being rolled out. Direct mode above never
      // takes this fallback.
    }
  }

  try {
    return await downloadEdgeArchive(row.object_id);
  } catch {
    return await downloadLegacyStorageArchive(row.archive_key!);
  }
}

export async function loadRiskObjectPayload(
  row: ArchivedRiskObjectRow,
): Promise<GeomacroRiskObject> {
  if (row.payload) return row.payload as GeomacroRiskObject;

  validateArchivedRow(row);
  const compressed = await downloadArchivedPayload(row);

  if (compressed.length > 2_000_000) throw new Error("RISK_OBJECT_ARCHIVE_TOO_LARGE");
  if (sha256(compressed) !== row.archive_sha256) {
    throw new Error("RISK_OBJECT_ARCHIVE_HASH_MISMATCH");
  }

  const decoded = gunzipSync(compressed, { maxOutputLength: 4_000_000 });
  const object = JSON.parse(decoded.toString("utf8")) as GeomacroRiskObject;
  if (
    object.object_id !== row.object_id ||
    object.integrity?.payload_hash !== row.payload_hash ||
    !verifyRiskObjectSignature(object).valid
  ) {
    throw new Error("RISK_OBJECT_ARCHIVE_INTEGRITY_FAILED");
  }
  return object;
}
