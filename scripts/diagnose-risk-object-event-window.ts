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

  const now =
    new Date();

  const cutoff =
    new Date(
      now.getTime() -
        72 * 3_600_000,
    );

  const result =
    await db
      .from(
        "live_structured_events",
      )
      .select(`
        id,
        domain,
        event_type,
        title,
        primary_country,
        countries,
        severity,
        confidence,
        direction,
        first_seen_at,
        last_seen_at,
        evidence_count,
        independent_source_count,
        evidence_refs,
        structure_version
      `)
      .order(
        "last_seen_at",
        {
          ascending: false,
        },
      )
      .limit(20);

  if (result.error) {
    throw result.error;
  }

  const rows =
    result.data ?? [];

  const mapped =
    rows.map((row) => {
      const lastSeen =
        new Date(
          String(
            row.last_seen_at,
          ),
        );

      const ageHours =
        (
          now.getTime() -
          lastSeen.getTime()
        ) / 3_600_000;

      return {
        id:
          row.id,

        domain:
          row.domain,

        event_type:
          row.event_type,

        title:
          row.title,

        primary_country:
          row.primary_country,

        countries:
          row.countries,

        severity:
          row.severity,

        confidence:
          row.confidence,

        last_seen_at:
          row.last_seen_at,

        age_hours:
          Number.isFinite(
            ageHours,
          )
            ? Number(
                ageHours.toFixed(3),
              )
            : null,

        inside_72h:
          Number.isFinite(
            ageHours,
          ) &&
          ageHours >= 0 &&
          ageHours <= 72,

        evidence_count:
          row.evidence_count,

        independent_source_count:
          row
            .independent_source_count,

        structure_version:
          row.structure_version,
      };
    });

  console.log(
    JSON.stringify(
      {
        now:
          now.toISOString(),

        cutoff:
          cutoff.toISOString(),

        total_rows_returned:
          mapped.length,

        inside_72h_count:
          mapped.filter(
            (row) =>
              row.inside_72h,
          ).length,

        newest_last_seen_at:
          mapped[0]
            ?.last_seen_at ??
          null,

        newest_age_hours:
          mapped[0]
            ?.age_hours ??
          null,

        rows:
          mapped,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
