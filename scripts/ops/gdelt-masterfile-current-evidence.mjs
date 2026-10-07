#!/usr/bin/env node
import { createHash } from "node:crypto";

export const GDELT_MASTERFILE_URL = "https://data.gdeltproject.org/gdeltv2/masterfilelist.txt";
export const GDELT_MASTERFILE_SOURCE_TRANSPORT = "event_export_masterfile_tail";

const LIVE_MAX_AGE_MS = 2 * 60 * 60 * 1000;
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
const MAX_TAIL_BYTES = 512 * 1024;
const MAX_RESPONSE_BYTES = MAX_TAIL_BYTES + 4096;
const MAX_CANDIDATES = 8;

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function parseTimestamp(value) {
  const match = /\/(\d{14})\.export\.CSV\.zip$/u.exec(String(value ?? ""));
  if (!match) return null;
  const stamp = match[1];
  const parsed = Date.UTC(
    Number(stamp.slice(0, 4)),
    Number(stamp.slice(4, 6)) - 1,
    Number(stamp.slice(6, 8)),
    Number(stamp.slice(8, 10)),
    Number(stamp.slice(10, 12)),
    Number(stamp.slice(12, 14)),
  );
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

export function parseGdeltMasterfileTail(
  text,
  { now = Date.now(), rangeStartsMidFile = true } = {},
) {
  const lines = String(text ?? "").split(/\r?\n/u);
  if (rangeStartsMidFile && lines.length) lines.shift();

  const byUrl = new Map();
  for (const line of lines) {
    const [sizeRaw, md5Raw, urlRaw, ...extra] = line.trim().split(/\s+/u);
    if (!sizeRaw || !md5Raw || !urlRaw || extra.length) continue;

    const size = Number(sizeRaw);
    const md5 = String(md5Raw).toLowerCase();
    if (!Number.isInteger(size) || size <= 0 || !/^[0-9a-f]{32}$/u.test(md5)) continue;

    let listed;
    try {
      listed = new URL(urlRaw);
    } catch {
      continue;
    }
    if (
      !["http:", "https:"].includes(listed.protocol) ||
      listed.hostname !== "data.gdeltproject.org" ||
      !/^\/gdeltv2\/\d{14}\.export\.CSV\.zip$/u.test(listed.pathname)
    ) continue;

    const batchIso = parseTimestamp(listed.pathname);
    const batchMs = Date.parse(String(batchIso ?? ""));
    if (
      !Number.isFinite(batchMs) ||
      batchMs > now + FUTURE_TOLERANCE_MS ||
      now - batchMs > LIVE_MAX_AGE_MS
    ) continue;

    const secureUrl = `https://data.gdeltproject.org${listed.pathname}`;
    byUrl.set(secureUrl, {
      size,
      md5,
      batchIso,
      listedUrl: listed.toString(),
      secureUrl,
    });
  }

  return [...byUrl.values()]
    .sort((a, b) => Date.parse(b.batchIso) - Date.parse(a.batchIso))
    .slice(0, MAX_CANDIDATES);
}

export async function readGdeltMasterfileCurrentCandidates({
  fetchFn = fetch,
  now = Date.now(),
} = {}) {
  let response;
  try {
    response = await fetchFn(GDELT_MASTERFILE_URL, {
      headers: {
        accept: "text/plain,*/*;q=0.1",
        range: `bytes=-${MAX_TAIL_BYTES}`,
        "user-agent": "Geomacro-GDELT-Masterfile-Current-Evidence/1.0 (+https://geomacro.live)",
      },
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    throw new Error(
      `CURRENT_GDELT_MASTERFILE_FETCH_FAILED:${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (response?.status !== 206) {
    throw new Error(`CURRENT_GDELT_MASTERFILE_RANGE_HTTP_${response?.status ?? "unknown"}`);
  }

  const contentRange = String(response.headers?.get?.("content-range") ?? "");
  const match = /^bytes (\d+)-(\d+)\/(\d+)$/u.exec(contentRange);
  if (!match) throw new Error("CURRENT_GDELT_MASTERFILE_CONTENT_RANGE_INVALID");
  const rangeStart = Number(match[1]);
  const rangeEnd = Number(match[2]);
  const totalBytes = Number(match[3]);
  if (
    !Number.isSafeInteger(rangeStart) ||
    !Number.isSafeInteger(rangeEnd) ||
    !Number.isSafeInteger(totalBytes) ||
    rangeStart < 0 ||
    rangeEnd < rangeStart ||
    totalBytes <= rangeEnd
  ) throw new Error("CURRENT_GDELT_MASTERFILE_CONTENT_RANGE_INVALID");

  const raw = await response.text();
  if (!raw || Buffer.byteLength(raw, "utf8") > MAX_RESPONSE_BYTES) {
    throw new Error("CURRENT_GDELT_MASTERFILE_RESPONSE_SIZE_INVALID");
  }

  const candidates = parseGdeltMasterfileTail(raw, {
    now,
    rangeStartsMidFile: rangeStart > 0,
  });
  if (!candidates.length) throw new Error("CURRENT_GDELT_MASTERFILE_NO_CURRENT_EXPORTS");

  return {
    candidates,
    masterfileDigest: sha256(Buffer.from(raw, "utf8")),
  };
}
