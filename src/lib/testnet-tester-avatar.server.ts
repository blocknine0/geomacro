import { randomBytes } from "node:crypto";

import { requireRiskSupabase } from "./risk-supabase.server";

const AVATAR_BUCKET = "testnet-tester-avatars";
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

export type TesterAvatarType = "image/png" | "image/jpeg" | "image/webp";

function detectAvatarType(bytes: Uint8Array): { mime: TesterAvatarType; ext: "png" | "jpg" | "webp" } | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return { mime: "image/png", ext: "png" };
  }

  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mime: "image/jpeg", ext: "jpg" };
  }

  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return { mime: "image/webp", ext: "webp" };
  }

  return null;
}

function assertPrincipalId(value: string) {
  if (!/^[0-9a-fA-F-]{36}$/.test(value)) throw new Error("INVALID_PRINCIPAL_ID");
}

export async function saveTestnetTesterAvatar(input: {
  principalId: string;
  bytes: Uint8Array;
}) {
  assertPrincipalId(input.principalId);
  if (!input.bytes.length || input.bytes.length > MAX_AVATAR_BYTES) {
    throw new Error("INVALID_AVATAR_SIZE");
  }

  const type = detectAvatarType(input.bytes);
  if (!type) throw new Error("INVALID_AVATAR_TYPE");

  const db = requireRiskSupabase();
  const profile = await db
    .from("testnet_tester_profiles")
    .select("avatar_path")
    .eq("principal_id", input.principalId)
    .maybeSingle();
  if (profile.error) throw profile.error;
  if (!profile.data) throw new Error("TESTNET_PROFILE_NOT_FOUND");

  const path = `${input.principalId}/${randomBytes(18).toString("hex")}.${type.ext}`;
  const upload = await db.storage.from(AVATAR_BUCKET).upload(path, input.bytes, {
    contentType: type.mime,
    upsert: false,
    cacheControl: "300",
  });
  if (upload.error) throw new Error("TESTNET_AVATAR_UPLOAD_FAILED");

  const update = await db
    .from("testnet_tester_profiles")
    .update({ avatar_path: path, updated_at: new Date().toISOString() })
    .eq("principal_id", input.principalId);
  if (update.error) {
    await db.storage.from(AVATAR_BUCKET).remove([path]);
    throw update.error;
  }

  const oldPath = profile.data.avatar_path;
  if (oldPath && oldPath !== path) {
    await db.storage.from(AVATAR_BUCKET).remove([oldPath]);
  }

  return { avatar_path: path, content_type: type.mime } as const;
}

export async function loadTestnetTesterAvatar(principalId: string) {
  assertPrincipalId(principalId);
  const db = requireRiskSupabase();
  const profile = await db
    .from("testnet_tester_profiles")
    .select("avatar_path")
    .eq("principal_id", principalId)
    .maybeSingle();
  if (profile.error) throw profile.error;
  const path = profile.data?.avatar_path;
  if (!path || !path.startsWith(`${principalId}/`)) throw new Error("TESTNET_AVATAR_NOT_FOUND");

  const download = await db.storage.from(AVATAR_BUCKET).download(path);
  if (download.error || !download.data) throw new Error("TESTNET_AVATAR_NOT_FOUND");
  const bytes = new Uint8Array(await download.data.arrayBuffer());
  const type = detectAvatarType(bytes);
  if (!type) throw new Error("TESTNET_AVATAR_CORRUPT");
  return { bytes, content_type: type.mime } as const;
}
