import { createDb, sha256 } from "./lib-live-source-utils.mjs"

const SOURCE_ID = "ucdp_candidate"
const WRITE = process.argv.includes("--write")
const db = createDb()

async function fetchAllLatestRows() {
  const pageSize = 1000
  const rows = []
  for (let from = 0; ; from += pageSize) {
    const result = await db
      .from("live_ucdp_candidate_latest")
      .select("source_record_id,country_iso3,observed_at,ingested_at,quality_status,commercial_eligibility_status,provenance,normalized_hash")
      .range(from, from + pageSize - 1)
    if (result.error) throw result.error
    const page = result.data ?? []
    rows.push(...page)
    if (page.length < pageSize) break
  }
  return rows
}

const rows = await fetchAllLatestRows()
if (!rows.length) throw new Error("No UCDP Candidate rows are available")

function releaseRank(row) {
  const value = Number(row?.provenance?.release_rank ?? 0)
  return Number.isInteger(value) && value > 0 ? value : 0
}

const latestReleaseRank = Math.max(...rows.map(releaseRank))
if (!latestReleaseRank) throw new Error("UCDP Candidate release_rank is missing")

const releaseRows = rows.filter((row) => releaseRank(row) === latestReleaseRank)
if (!releaseRows.length) throw new Error("Latest UCDP Candidate release has no rows")

const versions = new Set(
  releaseRows.map((row) => String(row?.provenance?.dataset_version ?? "").trim()).filter(Boolean),
)
if (versions.size !== 1) {
  throw new Error(`Latest UCDP Candidate release has inconsistent dataset versions: ${[...versions].join(",")}`)
}
const datasetVersion = [...versions][0]

const dates = releaseRows
  .map((row) => new Date(row.observed_at).getTime())
  .filter(Number.isFinite)
if (!dates.length) throw new Error("Latest UCDP Candidate release has no valid event dates")

const retrievedTimes = releaseRows
  .map((row) => new Date(row?.provenance?.retrieved_at ?? row.ingested_at).getTime())
  .filter(Number.isFinite)
if (!retrievedTimes.length) throw new Error("Latest UCDP Candidate release has no valid retrieval time")

const verifiedRows = releaseRows.filter(
  (row) => row.quality_status === "VERIFIED" && row.commercial_eligibility_status === "VERIFIED",
).length
const partialRows = releaseRows.length - verifiedRows

const manifestCore = {
  source_id: SOURCE_ID,
  release_id: `ucdp-candidate:${datasetVersion}`,
  dataset_version: datasetVersion,
  retrieved_at: new Date(Math.max(...retrievedTimes)).toISOString(),
  coverage_start: new Date(Math.min(...dates)).toISOString(),
  coverage_end: new Date(Math.max(...dates)).toISOString(),
  rows_downloaded: releaseRows.length,
  rows_normalized: releaseRows.length,
  verified_rows: verifiedRows,
  partial_rows: partialRows,
  rejected_rows: 0,
  unmapped_rows: 0,
  write_completed: WRITE,
  metadata: {
    release_rank: latestReleaseRank,
    transport: "OFFICIAL_DOWNLOAD_CSV",
    global_release: true,
    ingestion_contract: "UCDP_MAX_UNMAPPED_ROWS=0 and any structural rejection aborts before write",
    candidate_status: "PROVISIONAL_UNTIL_FINAL_ANNUAL_GED",
    raw_redistribution: false,
  },
}
const manifest = { ...manifestCore, manifest_hash: sha256(manifestCore) }

if (WRITE) {
  const result = await db
    .from("live_source_release_manifests")
    .upsert(manifest, { onConflict: "source_id,release_id" })
  if (result.error) throw result.error
}

console.log(JSON.stringify({ mode: WRITE ? "WRITE" : "DRY_RUN", ...manifest }, null, 2))
console.log(
  WRITE
    ? "PASS: UCDP CANDIDATE GLOBAL RELEASE MANIFEST RECORDED"
    : "PASS: UCDP CANDIDATE RELEASE MANIFEST DRY RUN CLEAN",
)
