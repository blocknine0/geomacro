import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { createClient } from "@supabase/supabase-js";

const SOURCE_KEY = "admitted_events";
const STREAM_KEY = "shared_structured_intelligence";
const LOOKBACK_HOURS = 72;
const PAGE_SIZE = 1000;
const FINGERPRINT_TTL_DAYS = 30;

const CATEGORIES = [
  "geopolitics",
  "macro",
  "rare_earth",
];

const dryRun =
  process.argv.includes("--dry-run");

function sha256(value) {
  return createHash("sha256")
    .update(value)
    .digest("hex");
}

function canonicalUrl(raw) {
  try {
    const u = new URL(String(raw));

    u.hash = "";
    u.hostname =
      u.hostname.toLowerCase();

    const drop = new Set([
      "fbclid",
      "gclid",
      "mc_cid",
      "mc_eid",
      "igshid",
      "ref",
      "ref_src",
    ]);

    for (
      const key of
        [...u.searchParams.keys()]
    ) {
      const lower =
        key.toLowerCase();

      if (
        lower.startsWith("utm_") ||
        drop.has(lower)
      ) {
        u.searchParams.delete(key);
      }
    }

    return u.toString();
  } catch {
    return null;
  }
}

function sourceDomain(
  row,
  url,
) {
  const explicit =
    String(
      row.source_domain ?? "",
    )
      .trim()
      .toLowerCase();

  if (explicit) {
    return explicit;
  }

  try {
    return new URL(url)
      .hostname
      .replace(/^www\./, "")
      .toLowerCase();
  } catch {
    return null;
  }
}

function mapEvent(row) {
  if (
    !row?.id ||
    !row?.source_url ||
    !row?.source_title ||
    !row?.created_at ||
    !CATEGORIES.includes(
      String(row.category),
    )
  ) {
    return null;
  }

  const url =
    canonicalUrl(
      row.source_url,
    );

  if (!url) {
    return null;
  }

  const fingerprint =
    sha256(url);

  const domain =
    sourceDomain(
      row,
      url,
    );

  /*
   * public.events summary/narrative may contain
   * classifier interpretation.
   *
   * Never recycle model output as raw publisher
   * evidence. Until an explicitly provenance-bound
   * publisher excerpt is stored, x remains empty.
   */
  return {
    id:
      String(row.id),

    createdAt:
      String(row.created_at),

    fingerprint,

    domain,

    category:
      String(row.category),

    record: {
      i: fingerprint,
      u: url,

      d:
        row.published_at ??
        row.created_at,

      h: domain,

      o:
        row.source_name ??
        null,

      t:
        String(
          row.source_title,
        ),

      x: "",

      l: null,
      a: null,

      q: [
        String(
          row.category,
        ),
      ],

      g:
        String(
          row.created_at,
        ),
    },
  };
}

async function main() {
  const supabaseUrl =
    process.env.SUPABASE_URL ??
    process.env.APP_SUPABASE_URL ??
    process.env.VITE_SUPABASE_URL;

  const serviceKey =
    process.env
      .SUPABASE_SERVICE_ROLE_KEY ??
    process.env
      .APP_SUPABASE_SERVICE_ROLE_KEY;

  if (
    !supabaseUrl ||
    !serviceKey
  ) {
    throw new Error(
      "Supabase server credentials are required",
    );
  }

  const db =
    createClient(
      supabaseUrl,
      serviceKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );

  const now =
    new Date();

  const nowIso =
    now.toISOString();

  const cutoff =
    new Date(
      now.getTime() -
        LOOKBACK_HOURS *
          3_600_000,
    ).toISOString();

  /*
   * Reuse the already deployed verified fragment
   * contract rather than inventing a new schema
   * version or storage bucket.
   */
  const {
    data: contract,
    error: contractError,
  } =
    await db
      .from(
        "live_fragment_manifest",
      )
      .select(
        "schema_version,storage_bucket",
      )
      .eq(
        "verification_method",
        "storage-readback-sha256",
      )
      .order(
        "verified_at",
        {
          ascending: false,
        },
      )
      .limit(1)
      .maybeSingle();

  if (contractError) {
    throw contractError;
  }

  if (
    !contract?.schema_version ||
    !contract?.storage_bucket
  ) {
    throw new Error(
      "No verified live fragment contract exists",
    );
  }

  const events = [];

  for (
    let from = 0;
    ;
    from += PAGE_SIZE
  ) {
    const {
      data,
      error,
    } =
      await db
        .from("events")
        .select(
          [
            "id",
            "source_url",
            "source_title",
            "source_name",
            "source_domain",
            "category",
            "published_at",
            "created_at",
          ].join(","),
        )
        .in(
          "category",
          CATEGORIES,
        )
        .gte(
          "created_at",
          cutoff,
        )
        .lte(
          "created_at",
          nowIso,
        )
        .order(
          "created_at",
          {
            ascending: true,
          },
        )
        .range(
          from,
          from +
            PAGE_SIZE -
            1,
        );

    if (error) {
      throw error;
    }

    const rows =
      data ?? [];

    events.push(...rows);

    if (
      rows.length <
      PAGE_SIZE
    ) {
      break;
    }
  }

  const candidates = [];
  const seen = new Set();

  let invalid = 0;
  let sameBatchDuplicate = 0;

  for (const row of events) {
    const mapped =
      mapEvent(row);

    if (!mapped) {
      invalid++;
      continue;
    }

    if (
      seen.has(
        mapped.fingerprint,
      )
    ) {
      sameBatchDuplicate++;
      continue;
    }

    seen.add(
      mapped.fingerprint,
    );

    candidates.push(
      mapped,
    );
  }

  const existing =
    new Set();

  const hashes =
    candidates.map(
      (x) =>
        x.fingerprint,
    );

  for (
    let i = 0;
    i < hashes.length;
    i += 200
  ) {
    const chunk =
      hashes.slice(
        i,
        i + 200,
      );

    const {
      data,
      error,
    } =
      await db
        .from(
          "live_recent_fingerprints",
        )
        .select(
          "fingerprint",
        )
        .in(
          "fingerprint",
          chunk,
        );

    if (error) {
      throw error;
    }

    for (
      const row of
        data ?? []
    ) {
      existing.add(
        row.fingerprint,
      );
    }
  }

  const accepted =
    candidates.filter(
      (x) =>
        !existing.has(
          x.fingerprint,
        ),
    );

  const topics =
    [
      ...new Set(
        accepted.map(
          (x) =>
            x.category,
        ),
      ),
    ].sort();

  const sourceDomains =
    [
      ...new Set(
        accepted
          .map(
            (x) =>
              x.domain,
          )
          .filter(Boolean),
      ),
    ].sort();

  const baseResult = {
    ok: true,

    dry_run:
      dryRun,

    source_key:
      SOURCE_KEY,

    stream_key:
      STREAM_KEY,

    schema_version:
      contract.schema_version,

    storage_bucket:
      contract.storage_bucket,

    cutoff,

    events_scanned:
      events.length,

    candidates:
      candidates.length,

    invalid_contract:
      invalid,

    duplicate_in_batch:
      sameBatchDuplicate,

    already_exported:
      candidates.length -
      accepted.length,

    accepted:
      accepted.length,

    topics,

    source_domains:
      sourceDomains,

    sample:
      accepted
        .slice(0, 8)
        .map(
          (x) => ({
            event_id:
              x.id,

            title:
              x.record.t,

            category:
              x.category,

            domain:
              x.domain,
          }),
        ),
  };

  if (dryRun) {
    console.log(
      JSON.stringify(
        {
          ...baseResult,

          status:
            accepted.length
              ? "would_export_structured_input_fragment"
              : "nothing_new_to_export",
        },
        null,
        2,
      ),
    );

    return;
  }

  if (
    accepted.length === 0
  ) {
    console.log(
      JSON.stringify(
        {
          ...baseResult,

          status:
            "nothing_new_to_export",
        },
        null,
        2,
      ),
    );

    return;
  }

  const ndjson =
    accepted
      .map(
        (x) =>
          JSON.stringify(
            x.record,
          ),
      )
      .join("\n") +
    "\n";

  const payload =
    Buffer.from(
      ndjson,
      "utf8",
    );

  const compressed =
    gzipSync(
      payload,
      {
        level: 9,
      },
    );

  const payloadHash =
    sha256(payload);

  const compressedHash =
    sha256(compressed);

  const {
    data: previous,
    error: previousError,
  } =
    await db
      .from(
        "live_fragment_manifest",
      )
      .select(
        "compressed_sha256",
      )
      .eq(
        "source_key",
        SOURCE_KEY,
      )
      .eq(
        "stream_key",
        STREAM_KEY,
      )
      .order(
        "period_end",
        {
          ascending: false,
        },
      )
      .limit(1)
      .maybeSingle();

  if (previousError) {
    throw previousError;
  }

  const previousHash =
    previous
      ?.compressed_sha256 ??
    null;

  const chainHash =
    sha256(
      `${previousHash ?? "GENESIS"}:${compressedHash}`,
    );

  const periodStart =
    accepted[0]
      .createdAt;

  const periodEnd =
    accepted.at(-1)
      .createdAt;

  const endDate =
    new Date(
      periodEnd,
    );

  const yyyy =
    endDate
      .getUTCFullYear();

  const mm =
    String(
      endDate.getUTCMonth() +
        1,
    ).padStart(2, "0");

  const dd =
    String(
      endDate.getUTCDate(),
    ).padStart(2, "0");

  const hh =
    String(
      endDate.getUTCHours(),
    ).padStart(2, "0");

  const stamp =
    endDate
      .toISOString()
      .replace(/\D/g, "")
      .slice(0, 14);

  const objectPath =
    `live/v1/${yyyy}/${mm}/${dd}/${hh}/admitted-events/` +
    `${stamp}-${compressedHash.slice(0, 16)}.ndjson.gz`;

  const {
    error: uploadError,
  } =
    await db.storage
      .from(
        contract.storage_bucket,
      )
      .upload(
        objectPath,
        compressed,
        {
          contentType:
            "application/gzip",

          upsert: false,
        },
      );

  if (uploadError) {
    throw uploadError;
  }

  const {
    data: downloaded,
    error: downloadError,
  } =
    await db.storage
      .from(
        contract.storage_bucket,
      )
      .download(
        objectPath,
      );

  if (
    downloadError ||
    !downloaded
  ) {
    throw (
      downloadError ??
      new Error(
        "Storage read-back failed",
      )
    );
  }

  const readBack =
    Buffer.from(
      await downloaded
        .arrayBuffer(),
    );

  const readBackHash =
    sha256(
      readBack,
    );

  if (
    readBackHash !==
    compressedHash
  ) {
    throw new Error(
      `Storage verification mismatch: ${readBackHash} != ${compressedHash}`,
    );
  }

  const {
    data: manifest,
    error: manifestError,
  } =
    await db
      .from(
        "live_fragment_manifest",
      )
      .insert({
        source_key:
          SOURCE_KEY,

        stream_key:
          STREAM_KEY,

        storage_bucket:
          contract.storage_bucket,

        object_path:
          objectPath,

        schema_version:
          contract.schema_version,

        compression:
          "gzip",

        period_start:
          periodStart,

        period_end:
          periodEnd,

        item_count:
          accepted.length,

        uncompressed_bytes:
          payload.byteLength,

        compressed_bytes:
          compressed.byteLength,

        payload_sha256:
          payloadHash,

        compressed_sha256:
          compressedHash,

        previous_fragment_sha256:
          previousHash,

        chain_sha256:
          chainHash,

        topics,

        countries:
          [],

        source_domains:
          sourceDomains,

        sealed_at:
          nowIso,

        verified_at:
          nowIso,

        verification_method:
          "storage-readback-sha256",
      })
      .select("id")
      .single();

  if (manifestError) {
    /*
     * Storage upload succeeded but the permanent manifest did not.
     * Remove the unsealed object so a retry remains idempotent.
     */
    const {
      error: cleanupError,
    } =
      await db.storage
        .from(
          contract.storage_bucket,
        )
        .remove([
          objectPath,
        ]);

    if (cleanupError) {
      throw new Error(
        `Manifest insert failed (${manifestError.message}); orphan cleanup also failed (${cleanupError.message})`,
      );
    }

    throw manifestError;
  }

  const expiresAt =
    new Date(
      now.getTime() +
        FINGERPRINT_TTL_DAYS *
          86_400_000,
    ).toISOString();

  for (
    let i = 0;
    i <
    accepted.length;
    i += 500
  ) {
    const rows =
      accepted
        .slice(
          i,
          i + 500,
        )
        .map(
          (x) => ({
            fingerprint:
              x.fingerprint,

            source_key:
              SOURCE_KEY,

            first_seen_at:
              nowIso,

            last_seen_at:
              nowIso,

            fragment_id:
              manifest.id,

            expires_at:
              expiresAt,
          }),
        );

    const {
      error,
    } =
      await db
        .from(
          "live_recent_fingerprints",
        )
        .upsert(
          rows,
          {
            onConflict:
              "fingerprint",

            ignoreDuplicates:
              true,
          },
        );

    if (error) {
      throw error;
    }
  }

  console.log(
    JSON.stringify(
      {
        ...baseResult,

        status:
          "structured_input_fragment_sealed",

        manifest_id:
          manifest.id,

        object_path:
          objectPath,

        period_start:
          periodStart,

        period_end:
          periodEnd,

        payload_sha256:
          payloadHash,

        compressed_sha256:
          compressedHash,

        chain_sha256:
          chainHash,

        storage_readback_verified:
          true,
      },
      null,
      2,
    ),
  );
}

main().catch(
  (error) => {
    console.error(
      "ADMITTED_EVENT_EXPORT_FAILED",
      error,
    );

    process.exit(1);
  },
);
