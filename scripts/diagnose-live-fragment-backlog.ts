import {
  createClient,
} from "@supabase/supabase-js";

async function main() {
  const url =
    process.env.SUPABASE_URL ??
    process.env.APP_SUPABASE_URL;

  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.APP_SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Authoritative Supabase server credentials are required",
    );
  }

  const db =
    createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

  const manifestResult =
    await db
      .from("live_fragment_manifest")
      .select(
        "id,object_path,item_count,period_start,period_end,verified_at,verification_method",
        {
          count: "exact",
        },
      )
      .eq(
        "verification_method",
        "storage-readback-sha256",
      )
      .order(
        "period_end",
        {
          ascending: false,
        },
      )
      .limit(100);

  if (manifestResult.error) {
    throw manifestResult.error;
  }

  const manifests =
    manifestResult.data ?? [];

  const ids =
    manifests.map(
      (row) => row.id,
    );

  const structuredCounts =
    new Map<string, number>();

  const excludedCounts =
    new Map<string, number>();

  for (
    let i = 0;
    i < ids.length;
    i += 50
  ) {
    const chunk =
      ids.slice(i, i + 50);

    const structured =
      await db
        .from(
          "live_structured_event_evidence",
        )
        .select("fragment_id")
        .in(
          "fragment_id",
          chunk,
        );

    if (structured.error) {
      throw structured.error;
    }

    for (
      const row of structured.data ?? []
    ) {
      structuredCounts.set(
        row.fragment_id,
        (
          structuredCounts.get(
            row.fragment_id,
          ) ?? 0
        ) + 1,
      );
    }

    const excluded =
      await db
        .from(
          "live_structuring_exclusions",
        )
        .select("fragment_id")
        .in(
          "fragment_id",
          chunk,
        );

    if (excluded.error) {
      throw excluded.error;
    }

    for (
      const row of excluded.data ?? []
    ) {
      excludedCounts.set(
        row.fragment_id,
        (
          excludedCounts.get(
            row.fragment_id,
          ) ?? 0
        ) + 1,
      );
    }
  }

  const rows =
    manifests.map(
      (manifest) => {
        const structured =
          structuredCounts.get(
            manifest.id,
          ) ?? 0;

        const excluded =
          excludedCounts.get(
            manifest.id,
          ) ?? 0;

        const handled =
          structured +
          excluded;

        return {
          id:
            manifest.id,

          period_end:
            manifest.period_end,

          verified_at:
            manifest.verified_at,

          item_count:
            Number(
              manifest.item_count,
            ),

          structured,

          excluded,

          handled,

          remaining:
            Math.max(
              0,
              Number(
                manifest.item_count,
              ) -
              handled,
            ),

          complete:
            handled >=
            Number(
              manifest.item_count,
            ),
        };
      },
    );

  const pending =
    rows.filter(
      (row) =>
        !row.complete,
    );

  console.log(
    JSON.stringify(
      {
        verified_manifest_count:
          manifestResult.count,

        inspected_newest:
          rows.length,

        newest_period_end:
          rows[0]
            ?.period_end ??
          null,

        oldest_inspected_period_end:
          rows.at(-1)
            ?.period_end ??
          null,

        pending_in_newest_100:
          pending.length,

        newest_15:
          rows.slice(
            0,
            15,
          ),

        pending:
          pending.slice(
            0,
            30,
          ),
      },
      null,
      2,
    ),
  );

  if (
    pending.length > 0
  ) {
    console.log(
      "\nFOUND_PENDING_FRAGMENT_BACKLOG",
    );
  } else {
    console.log(
      "\nNO_PENDING_FRAGMENT_IN_NEWEST_100",
    );
  }
}

main().catch(
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
