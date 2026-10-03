const GUARDIAN_HOST = "content.guardianapis.com";

/**
 * Production-only discovery boundary used by the direct-Postgres ingestion job.
 *
 * The Guardian Open Platform lane is intentionally non-commercial until a
 * written licence is recorded. Requests to that host are therefore satisfied
 * locally with an empty successful result set; no Guardian request leaves the
 * runner and no Guardian content can enter commercial scoring. Every other
 * request is delegated to Node's native fetch implementation.
 */
export default async function geomacroNoGuardianFetch(input, init) {
  const raw =
    typeof input === "string"
      ? input
      : input && typeof input === "object" && "url" in input
        ? String(input.url)
        : String(input ?? "");

  let url = null;
  try {
    url = new URL(raw);
  } catch {
    // Non-URL inputs are delegated unchanged to the native implementation.
  }

  if (
    String(process.env.GEOMACRO_DISABLE_GUARDIAN ?? "").toLowerCase() === "true" &&
    url?.hostname === GUARDIAN_HOST
  ) {
    return new Response(
      JSON.stringify({
        response: {
          status: "ok",
          userTier: "disabled",
          total: 0,
          startIndex: 1,
          pageSize: 0,
          currentPage: 1,
          pages: 0,
          orderBy: "relevance",
          results: [],
        },
      }),
      {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
      },
    );
  }

  return globalThis.fetch(input, init);
}
