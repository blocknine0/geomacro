import { createClient } from "npm:@supabase/supabase-js@2";

const SOURCE_KEY = "gdelt_gal";
const STREAM_KEY = "global-relevant";
const BUCKET = "geomacro-live-intelligence";
const SCHEMA_VERSION = "live-evidence-v1.0.0";

const LOOKBACK_MINUTES = 35;
const MAX_SOURCE_FILES_PER_RUN = 8;
const FINGERPRINT_TTL_DAYS = 30;

type Topic = "geopolitics" | "macro" | "rare_earth";

type GalRow = {
  date?: string;
  url?: string;
  domain?: string;
  outletName?: string;
  outletLogo?: string;
  outletTwitter?: string;
  title?: string;
  image?: string;
  desc?: string;
  lang?: string;
  author?: string;
};

const TOPIC_PATTERNS: Record<Topic, RegExp[]> = {
  geopolitics: [
    /\bwar\b/i,
    /\bconflict\b/i,
    /\bmilitary\b/i,
    /\barmy\b/i,
    /\bnavy\b/i,
    /\bair\s*force\b/i,
    /\bmissile/i,
    /\bdrone/i,
    /\battack/i,
    /\bstrike/i,
    /\binvasion/i,
    /\bceasefire/i,
    /\bsanction/i,
    /\bdiplomat/i,
    /\belection/i,
    /\breferendum/i,
    /\bcoup\b/i,
    /\bprotest/i,
    /\briot/i,
    /\bborder/i,
    /\bterritor/i,
    /\bgeopolit/i,
    /\bsecurity council\b/i,
    /\bnato\b/i,
    /\bexport control/i,
    /\btrade war\b/i,
    /\btariff/i,
    /\bembargo/i,
  ],

  macro: [
    /\binflation\b/i,
    /\bcpi\b/i,
    /\bppi\b/i,
    /\bgdp\b/i,
    /\bgross domestic product\b/i,
    /\binterest rate/i,
    /\brate cut/i,
    /\brate hike/i,
    /\bcentral bank/i,
    /\bmonetary policy/i,
    /\bfederal reserve\b/i,
    /\becb\b/i,
    /\bbank of england\b/i,
    /\bbank of japan\b/i,
    /\brbi\b/i,
    /\bunemployment\b/i,
    /\bpayroll/i,
    /\bjobs report\b/i,
    /\bpmi\b/i,
    /\brecession\b/i,
    /\bsovereign debt\b/i,
    /\bbond yield/i,
    /\bfiscal\b/i,
    /\bbudget\b/i,
    /\btrade balance\b/i,
    /\bcurrent account\b/i,
    /\bcurrency\b/i,
    /\bforeign exchange\b/i,
    /\bforex\b/i,
    /\bcapital control/i,
    /\bbanking crisis\b/i,
    /\bdefault\b/i,
  ],

  rare_earth: [
    /\brare earth/i,
    /\bcritical mineral/i,
    /\bneodymium\b/i,
    /\bpraseodymium\b/i,
    /\bdysprosium\b/i,
    /\bterbium\b/i,
    /\byttrium\b/i,
    /\blanthanum\b/i,
    /\bcerium\b/i,
    /\bsamarium\b/i,
    /\beuropium\b/i,
    /\bgadolinium\b/i,
    /\bndpr\b/i,
    /\bndfeb\b/i,
    /\bpermanent magnet/i,
    /\brare-earth oxide/i,
    /\brare earth oxide/i,
    /\brare-earth metal/i,
    /\brare earth metal/i,
    /\bmineral processing\b/i,
    /\bmineral refining\b/i,
    /\bseparation plant\b/i,
    /\bstrategic mineral/i,
  ],
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function getAdminClient() {
  const url = Deno.env.get("SUPABASE_URL");
  if (!url) throw new Error("SUPABASE_URL missing");

  const secretMapRaw = Deno.env.get("SUPABASE_SECRET_KEYS");
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  let secret: string | undefined;

  if (secretMapRaw) {
    const parsed = JSON.parse(secretMapRaw);
    secret = parsed.default;
  }

  secret ||= legacy;

  if (!secret) {
    throw new Error("No Supabase backend secret available");
  }

  return createClient(url, secret, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function canonicalizeUrl(raw: string): string | null {
  try {
    const u = new URL(raw);

    u.hash = "";
    u.hostname = u.hostname.toLowerCase();

    const drop = [
      "fbclid",
      "gclid",
      "mc_cid",
      "mc_eid",
      "igshid",
      "ref",
      "ref_src",
    ];

    for (const key of [...u.searchParams.keys()]) {
      const lower = key.toLowerCase();
      if (lower.startsWith("utm_") || drop.includes(lower)) {
        u.searchParams.delete(key);
      }
    }

    u.searchParams.sort();

    if (u.pathname !== "/" && u.pathname.endsWith("/")) {
      u.pathname = u.pathname.slice(0, -1);
    }

    return u.toString();
  } catch {
    return null;
  }
}

async function sha256Hex(input: string | Uint8Array): Promise<string> {
  const bytes =
    typeof input === "string"
      ? new TextEncoder().encode(input)
      : input;

  const digest = await crypto.subtle.digest("SHA-256", bytes);

  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function classifyTopics(row: GalRow): Topic[] {
  const text = [
    row.title ?? "",
    row.desc ?? "",
    row.domain ?? "",
    row.outletName ?? "",
  ].join(" ");

  const matches: Topic[] = [];

  for (const [topic, patterns] of Object.entries(TOPIC_PATTERNS) as [
    Topic,
    RegExp[],
  ][]) {
    if (patterns.some((pattern) => pattern.test(text))) {
      matches.push(topic);
    }
  }

  return matches;
}

function utcMinuteStamp(date: Date): string {
  const y = date.getUTCFullYear().toString();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const h = String(date.getUTCHours()).padStart(2, "0");
  const min = String(date.getUTCMinutes()).padStart(2, "0");

  return `${y}${m}${d}${h}${min}00`;
}

function stampToDate(stamp: string): Date {
  return new Date(
    Date.UTC(
      Number(stamp.slice(0, 4)),
      Number(stamp.slice(4, 6)) - 1,
      Number(stamp.slice(6, 8)),
      Number(stamp.slice(8, 10)),
      Number(stamp.slice(10, 12)),
      0,
    ),
  );
}

function candidateStamps(now = new Date()): string[] {
  const out: string[] = [];

  for (let i = LOOKBACK_MINUTES; i >= 1; i--) {
    const d = new Date(now.getTime() - i * 60_000);
    out.push(utcMinuteStamp(d));
  }

  return out;
}

async function fetchGalFile(stamp: string) {
  const url =
    `https://storage.googleapis.com/data.gdeltproject.org/gdeltv3/gal/${stamp}.gal.json.gz`;

  const response = await fetch(url, {
    headers: {
      "user-agent": "Geomacro-Live-Intelligence/1.0",
    },
  });

  if (response.status === 404) return null;

  if (!response.ok) {
    throw new Error(`GDELT ${stamp}: HTTP ${response.status}`);
  }

  const compressed = new Uint8Array(await response.arrayBuffer());

  const stream = new Blob([compressed])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));

  const text = await new Response(stream).text();

  return {
    stamp,
    sourceUrl: url,
    compressed,
    text,
  };
}

async function gzip(input: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([input])
    .stream()
    .pipeThrough(new CompressionStream("gzip"));

  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function compactRow(
  row: GalRow,
  canonicalUrl: string,
  fingerprint: string,
  topics: Topic[],
  sourceStamp: string,
) {
  return {
    i: fingerprint,
    u: canonicalUrl,
    d: row.date ?? null,
    h: row.domain ?? null,
    o: row.outletName ?? null,
    t: row.title ?? null,
    x: row.desc ?? null,
    l: row.lang ?? null,
    a: row.author ?? null,
    q: topics,
    g: sourceStamp,
  };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse(
      { ok: false, error: "POST required" },
      405,
    );
  }

  const ingestSecret = Deno.env.get("LIVE_INGEST_TOKEN");
  const suppliedSecret = req.headers.get("x-geomacro-ingest-token");

  if (!ingestSecret || suppliedSecret !== ingestSecret) {
    return jsonResponse(
      { ok: false, error: "unauthorized" },
      401,
    );
  }

  const supabase = getAdminClient();
  const now = new Date();
  const nowIso = now.toISOString();

  try {
    const { data: cursorRow, error: cursorError } = await supabase
      .from("live_ingestion_cursors")
      .select("cursor,last_success_at")
      .eq("source_key", SOURCE_KEY)
      .eq("stream_key", STREAM_KEY)
      .maybeSingle();

    if (cursorError) throw cursorError;

    const lastStamp =
      typeof cursorRow?.cursor?.last_source_stamp === "string"
        ? cursorRow.cursor.last_source_stamp
        : null;

    const stamps = candidateStamps(now)
      .filter((stamp) => !lastStamp || stamp > lastStamp);

    const available: Awaited<ReturnType<typeof fetchGalFile>>[] = [];

    for (const stamp of stamps) {
      const file = await fetchGalFile(stamp);

      if (file) {
        available.push(file);
      }

      if (available.length >= MAX_SOURCE_FILES_PER_RUN) break;
    }

    if (available.length === 0) {
      await supabase
        .from("live_ingestion_cursors")
        .upsert(
          {
            source_key: SOURCE_KEY,
            stream_key: STREAM_KEY,
            cursor: lastStamp
              ? { last_source_stamp: lastStamp }
              : {},
            status: "healthy",
            last_attempt_at: nowIso,
            consecutive_failures: 0,
            updated_at: nowIso,
          },
          { onConflict: "source_key,stream_key" },
        );

      return jsonResponse({
        ok: true,
        status: "no_new_gdelt_file",
        last_source_stamp: lastStamp,
      });
    }

    const batchSeen = new Set<string>();
    const candidates: {
      fingerprint: string;
      record: Record<string, unknown>;
    }[] = [];

    let itemsSeen = 0;
    let itemsRejected = 0;
    let sameBatchDuplicate = 0;

    for (const file of available) {
      if (!file) continue;

      for (const line of file.text.split("\n")) {
        if (!line.trim()) continue;

        itemsSeen += 1;

        let row: GalRow;

        try {
          row = JSON.parse(line);
        } catch {
          itemsRejected += 1;
          continue;
        }

        if (!row.url || !row.title) {
          itemsRejected += 1;
          continue;
        }

        const topics = classifyTopics(row);

        // Permanent archive contains only Geomacro-relevant evidence.
        if (topics.length === 0) {
          itemsRejected += 1;
          continue;
        }

        const canonicalUrl = canonicalizeUrl(row.url);

        if (!canonicalUrl) {
          itemsRejected += 1;
          continue;
        }

        const fingerprint = await sha256Hex(canonicalUrl);

        if (batchSeen.has(fingerprint)) {
          sameBatchDuplicate += 1;
          continue;
        }

        batchSeen.add(fingerprint);

        candidates.push({
          fingerprint,
          record: compactRow(
            row,
            canonicalUrl,
            fingerprint,
            topics,
            file.stamp,
          ),
        });
      }
    }

    const existing = new Set<string>();
    const hashes = candidates.map((x) => x.fingerprint);

    for (let i = 0; i < hashes.length; i += 200) {
      const chunk = hashes.slice(i, i + 200);

      const { data, error } = await supabase
        .from("live_recent_fingerprints")
        .select("fingerprint")
        .in("fingerprint", chunk);

      if (error) throw error;

      for (const row of data ?? []) {
        existing.add(row.fingerprint);
      }
    }

    const accepted = candidates.filter(
      (x) => !existing.has(x.fingerprint),
    );

    const databaseDuplicate =
      candidates.length - accepted.length;

    const latestStamp =
      available
        .filter(Boolean)
        .map((x) => x!.stamp)
        .sort()
        .at(-1)!;

    if (accepted.length === 0) {
      await supabase
        .from("live_ingestion_cursors")
        .upsert(
          {
            source_key: SOURCE_KEY,
            stream_key: STREAM_KEY,
            cursor: { last_source_stamp: latestStamp },
            status: "healthy",
            last_attempt_at: nowIso,
            last_success_at: nowIso,
            consecutive_failures: 0,
            updated_at: nowIso,
          },
          { onConflict: "source_key,stream_key" },
        );

      return jsonResponse({
        ok: true,
        status: "all_duplicates_or_irrelevant",
        files_seen: available.length,
        items_seen: itemsSeen,
        relevant_candidates: candidates.length,
      });
    }

    const ndjson =
      accepted.map((x) => JSON.stringify(x.record)).join("\n") + "\n";

    const payloadBytes = new TextEncoder().encode(ndjson);
    const compressedBytes = await gzip(payloadBytes);

    const payloadSha256 = await sha256Hex(payloadBytes);
    const compressedSha256 = await sha256Hex(compressedBytes);

    const { data: previous, error: previousError } = await supabase
      .from("live_fragment_manifest")
      .select("compressed_sha256")
      .eq("source_key", SOURCE_KEY)
      .eq("stream_key", STREAM_KEY)
      .order("period_end", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (previousError) throw previousError;

    const previousFragmentSha256 =
      previous?.compressed_sha256 ?? null;

    const chainSha256 = await sha256Hex(
      `${previousFragmentSha256 ?? "GENESIS"}:${compressedSha256}`,
    );

    const periodStart = stampToDate(
      available.filter(Boolean).map((x) => x!.stamp).sort()[0],
    );

    const periodEnd = stampToDate(latestStamp);

    const yyyy = latestStamp.slice(0, 4);
    const mm = latestStamp.slice(4, 6);
    const dd = latestStamp.slice(6, 8);
    const hh = latestStamp.slice(8, 10);

    const objectPath =
      `live/v1/${yyyy}/${mm}/${dd}/${hh}/gdelt-gal/` +
      `${latestStamp}-${compressedSha256.slice(0, 16)}.ndjson.gz`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(objectPath, compressedBytes, {
        contentType: "application/gzip",
        upsert: false,
      });

    if (uploadError) throw uploadError;

    // Mandatory read-back verification before manifest sealing.
    const { data: downloaded, error: downloadError } =
      await supabase.storage
        .from(BUCKET)
        .download(objectPath);

    if (downloadError || !downloaded) {
      throw downloadError ?? new Error("Storage read-back failed");
    }

    const readBackBytes =
      new Uint8Array(await downloaded.arrayBuffer());

    const readBackSha256 =
      await sha256Hex(readBackBytes);

    if (readBackSha256 !== compressedSha256) {
      throw new Error(
        `Storage verification mismatch: ${readBackSha256} != ${compressedSha256}`,
      );
    }

    const topicSet = new Set<string>();

    for (const item of accepted) {
      const q = item.record.q;
      if (Array.isArray(q)) {
        for (const topic of q) topicSet.add(String(topic));
      }
    }

    const { data: manifest, error: manifestError } = await supabase
      .from("live_fragment_manifest")
      .insert({
        source_key: SOURCE_KEY,
        stream_key: STREAM_KEY,
        storage_bucket: BUCKET,
        object_path: objectPath,
        schema_version: SCHEMA_VERSION,
        compression: "gzip",
        period_start: periodStart.toISOString(),
        period_end: periodEnd.toISOString(),
        item_count: accepted.length,
        uncompressed_bytes: payloadBytes.byteLength,
        compressed_bytes: compressedBytes.byteLength,
        payload_sha256: payloadSha256,
        compressed_sha256: compressedSha256,
        previous_fragment_sha256: previousFragmentSha256,
        chain_sha256: chainSha256,
        topics: [...topicSet].sort(),
        countries: [],
        source_domains: [],
        sealed_at: nowIso,
        verified_at: nowIso,
        verification_method: "storage-readback-sha256",
      })
      .select("id")
      .single();

    if (manifestError) throw manifestError;

    const expiresAt =
      new Date(
        now.getTime() +
          FINGERPRINT_TTL_DAYS * 24 * 60 * 60 * 1000,
      ).toISOString();

    for (let i = 0; i < accepted.length; i += 500) {
      const rows = accepted.slice(i, i + 500).map((x) => ({
        fingerprint: x.fingerprint,
        source_key: SOURCE_KEY,
        first_seen_at: nowIso,
        last_seen_at: nowIso,
        fragment_id: manifest.id,
        expires_at: expiresAt,
      }));

      const { error } = await supabase
        .from("live_recent_fingerprints")
        .upsert(rows, {
          onConflict: "fingerprint",
          ignoreDuplicates: true,
        });

      if (error) throw error;
    }

    const { error: runError } = await supabase
      .from("live_ingestion_runs")
      .insert({
        source_key: SOURCE_KEY,
        stream_key: STREAM_KEY,
        started_at: nowIso,
        finished_at: new Date().toISOString(),
        status: "succeeded",
        window_start: periodStart.toISOString(),
        window_end: periodEnd.toISOString(),
        items_seen: itemsSeen,
        items_accepted: accepted.length,
        items_duplicate:
          sameBatchDuplicate + databaseDuplicate,
        items_rejected: itemsRejected,
        fragment_id: manifest.id,
        metrics: {
          source_files: available.length,
          source_stamps: available
            .filter(Boolean)
            .map((x) => x!.stamp),
          relevant_candidates: candidates.length,
          compression_ratio:
            payloadBytes.byteLength === 0
              ? null
              : Number(
                  (
                    compressedBytes.byteLength /
                    payloadBytes.byteLength
                  ).toFixed(6),
                ),
        },
      });

    if (runError) throw runError;

    const { error: cursorUpdateError } = await supabase
      .from("live_ingestion_cursors")
      .upsert(
        {
          source_key: SOURCE_KEY,
          stream_key: STREAM_KEY,
          cursor: { last_source_stamp: latestStamp },
          status: "healthy",
          last_attempt_at: nowIso,
          last_success_at: nowIso,
          last_item_at: periodEnd.toISOString(),
          consecutive_failures: 0,
          updated_at: nowIso,
        },
        { onConflict: "source_key,stream_key" },
      );

    if (cursorUpdateError) throw cursorUpdateError;

    return jsonResponse({
      ok: true,
      status: "sealed",
      fragment_id: manifest.id,
      object_path: objectPath,
      source_files: available.length,
      items_seen: itemsSeen,
      items_accepted: accepted.length,
      items_duplicate:
        sameBatchDuplicate + databaseDuplicate,
      items_rejected: itemsRejected,
      uncompressed_bytes: payloadBytes.byteLength,
      compressed_bytes: compressedBytes.byteLength,
      compressed_sha256: compressedSha256,
      chain_sha256: chainSha256,
      latest_source_stamp: latestStamp,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    const { data: existing } = await supabase
      .from("live_ingestion_cursors")
      .select("consecutive_failures,cursor")
      .eq("source_key", SOURCE_KEY)
      .eq("stream_key", STREAM_KEY)
      .maybeSingle();

    const failures =
      Number(existing?.consecutive_failures ?? 0) + 1;

    await supabase
      .from("live_ingestion_cursors")
      .upsert(
        {
          source_key: SOURCE_KEY,
          stream_key: STREAM_KEY,
          cursor: existing?.cursor ?? {},
          status: failures >= 3 ? "failed" : "degraded",
          last_attempt_at: nowIso,
          consecutive_failures: failures,
          updated_at: nowIso,
        },
        { onConflict: "source_key,stream_key" },
      );

    await supabase
      .from("live_ingestion_runs")
      .insert({
        source_key: SOURCE_KEY,
        stream_key: STREAM_KEY,
        started_at: nowIso,
        finished_at: new Date().toISOString(),
        status: "failed",
        error_code: "INGEST_FAILED",
        error_detail: message.slice(0, 2000),
      });

    return jsonResponse(
      {
        ok: false,
        error: "INGEST_FAILED",
        detail: message,
      },
      500,
    );
  }
});
