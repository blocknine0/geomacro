#!/usr/bin/env node
/**
 * Historical B2 version recovery is retired while B2 list APIs are forbidden.
 * Recovery can resume only after D1 stores the exact immutable B2 version ID.
 */
export function selectPinnedHistoricalVersion(indexedRow, anchor, key) {
  const fail = () => { throw new Error("GRI_VERSION_D1_FILE_INDEX_REQUIRED"); };
  if (!indexedRow || !anchor || typeof key !== "string") fail();
  if (indexedRow.path !== key || typeof indexedRow.b2_file_id !== "string" ||
      indexedRow.b2_file_id.length < 10 || indexedRow.sha256 !== anchor.b2_sha256) fail();
  return indexedRow;
}

export async function recoverPinnedGriVersion({ fetchImpl = fetch } = {}) {
  void fetchImpl;
  throw new Error("GRI_VERSION_D1_FILE_INDEX_REQUIRED");
}

if (process.argv[1]?.endsWith("/recover-gri-pinned-b2-version.mjs")) {
  try {
    await recoverPinnedGriVersion();
  } catch (error) {
    const code = error instanceof Error && /^GRI_VERSION_[A-Z0-9_]+$/u.test(error.message)
      ? error.message : "GRI_VERSION_D1_FILE_INDEX_REQUIRED";
    console.error(JSON.stringify({ schema: "geomacro.gri-immutable-version-readback-failure.v1",
      error_code: code, b2_list_calls: 0, current_gri_qualified: false,
      publication_performed: false, raw_content_logged: false, payments: 0 }));
    process.exitCode = 2;
  }
}
