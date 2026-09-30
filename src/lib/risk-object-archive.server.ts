import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { requireRiskSupabase } from "./risk-supabase.server";
import { verifyRiskObjectSignature } from "./risk-object-signing.server";
import type { GeomacroRiskObject } from "./risk-object-contract";

type ArchivedRiskObjectRow = {
  object_id: string;
  payload: unknown;
  payload_hash?: string | null;
  archive_key?: string | null;
  archive_sha256?: string | null;
};

const sha256 = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
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

export async function loadRiskObjectPayload(row: ArchivedRiskObjectRow): Promise<GeomacroRiskObject> {
  if (row.payload) return row.payload as GeomacroRiskObject;
  if (!/^gro_[A-Za-z0-9_]+$/.test(row.object_id) ||
      row.archive_key !== `risk-object-archive/v1/${row.object_id}.json.gz` ||
      !/^[a-f0-9]{64}$/.test(row.payload_hash ?? "") ||
      !/^[a-f0-9]{64}$/.test(row.archive_sha256 ?? "")) {
    throw new Error("RISK_OBJECT_ARCHIVE_POINTER_INVALID");
  }

  // B2 is now the canonical cold path for externalized GRO payloads. Prefer the
  // verified server-side bridge so bundle-backed rows do not first generate a
  // guaranteed failed Supabase Storage GET. Keep Storage as a legacy fallback
  // for older rows that may not yet exist in B2.
  let compressed: Buffer;
  try {
    compressed = await downloadEdgeArchive(row.object_id);
  } catch {
    compressed = await downloadLegacyStorageArchive(row.archive_key);
  }

  if (compressed.length > 2_000_000) throw new Error("RISK_OBJECT_ARCHIVE_TOO_LARGE");
  if (sha256(compressed) !== row.archive_sha256) {
    throw new Error("RISK_OBJECT_ARCHIVE_HASH_MISMATCH");
  }
  const decoded = gunzipSync(compressed, { maxOutputLength: 4_000_000 });
  const object = JSON.parse(decoded.toString("utf8")) as GeomacroRiskObject;
  if (object.object_id !== row.object_id ||
      object.integrity?.payload_hash !== row.payload_hash ||
      !verifyRiskObjectSignature(object).valid) {
    throw new Error("RISK_OBJECT_ARCHIVE_INTEGRITY_FAILED");
  }
  return object;
}
