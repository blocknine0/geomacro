import fs from "node:fs"

const OUTPUT =
  process.env.GLOBAL_REALTIME_SOURCE_OUTPUT ??
  "global-realtime-source-freshness.json"

const now = new Date()

function ageMinutes(timestamp) {
  return Math.max(0, (now.getTime() - timestamp.getTime()) / 60_000)
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Geomacro-Global-Realtime-Source-Proof/1.0",
    },
  })
  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}`)
  }
  return response.text()
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "Geomacro-Global-Realtime-Source-Proof/1.0",
    },
  })
  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}`)
  }
  return response.json()
}

function gdeltTimestampFromUrl(url) {
  const match = /\/(\d{14})\.(?:export|mentions|gkg)\.CSV\.zip$/i.exec(url)
  if (!match) return null
  const value = match[1]
  const year = Number(value.slice(0, 4))
  const month = Number(value.slice(4, 6))
  const day = Number(value.slice(6, 8))
  const hour = Number(value.slice(8, 10))
  const minute = Number(value.slice(10, 12))
  const second = Number(value.slice(12, 14))
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second))
}

async function auditGdelt() {
  const lastUpdateUrl = "https://data.gdeltproject.org/gdeltv2/lastupdate.txt"
  const text = await fetchText(lastUpdateUrl)
  const lines = text
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  const releases = lines.map((line) => {
    const parts = line.split(/\s+/)
    const url = parts.at(-1)
    const timestamp = gdeltTimestampFromUrl(url)
    return {
      bytes: Number(parts[0]) || null,
      md5: parts[1] ?? null,
      url,
      timestamp: timestamp?.toISOString() ?? null,
      age_minutes: timestamp ? Number(ageMinutes(timestamp).toFixed(2)) : null,
    }
  })

  const eventRelease = releases.find((row) => /\.export\.CSV\.zip$/i.test(row.url))
  if (!eventRelease?.timestamp) {
    throw new Error("GDELT lastupdate.txt did not expose a parseable Event release")
  }

  const maxAgeMinutes = Number(process.env.GDELT_MAX_RELEASE_AGE_MINUTES ?? 60)
  const pass = eventRelease.age_minutes <= maxAgeMinutes

  return {
    source_id: "gdelt_v2_events",
    source_scope: "global monitored news-derived event metadata",
    release_contract: "15-minute GDELT 2.0 release cadence",
    last_update_url: lastUpdateUrl,
    event_release: eventRelease,
    all_release_rows: releases,
    max_allowed_release_age_minutes: maxAgeMinutes,
    freshness_pass: pass,
    absence_semantics:
      "No event row for a country in one release is not evidence of zero country risk. This check proves feed freshness, not country-level zero-event completeness.",
  }
}

async function auditUsgs() {
  const feedUrl =
    "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson"
  const payload = await fetchJson(feedUrl)
  const generatedMs = Number(payload?.metadata?.generated)
  if (!Number.isFinite(generatedMs)) {
    throw new Error("USGS GeoJSON feed is missing metadata.generated")
  }

  const generatedAt = new Date(generatedMs)
  const maxAgeMinutes = Number(process.env.USGS_MAX_FEED_AGE_MINUTES ?? 10)
  const generatedAgeMinutes = Number(ageMinutes(generatedAt).toFixed(2))

  const features = Array.isArray(payload?.features) ? payload.features : []
  const latestEventMs = features.reduce((latest, feature) => {
    const eventTime = Number(feature?.properties?.time)
    return Number.isFinite(eventTime) ? Math.max(latest, eventTime) : latest
  }, 0)

  return {
    source_id: "usgs_earthquake_hazards",
    source_scope: "global earthquake events",
    feed_url: feedUrl,
    documented_update_cadence: "every minute",
    generated_at: generatedAt.toISOString(),
    generated_age_minutes: generatedAgeMinutes,
    max_allowed_feed_age_minutes: maxAgeMinutes,
    feed_event_count: Number(payload?.metadata?.count ?? features.length),
    latest_event_at: latestEventMs ? new Date(latestEventMs).toISOString() : null,
    freshness_pass: generatedAgeMinutes <= maxAgeMinutes,
    absence_semantics:
      "A country with no earthquake in the current feed is not assigned a synthetic hazard score. Country impact mapping requires a separately versioned geospatial methodology.",
  }
}

async function main() {
  const [gdelt, usgs] = await Promise.all([auditGdelt(), auditUsgs()])
  const checks = [gdelt, usgs]
  const report = {
    schema_version: "geomacro-global-realtime-source-freshness-1.0",
    generated_at: now.toISOString(),
    writes_performed: false,
    claim_boundary: {
      proves_live_source_freshness: true,
      proves_all_country_scoring: false,
      source_absence_never_becomes_zero_risk: true,
      downstream_country_mapping_requires_versioned_methodology: true,
    },
    checks,
    summary: {
      checked_sources: checks.length,
      passed_sources: checks.filter((row) => row.freshness_pass).length,
      failed_sources: checks.filter((row) => !row.freshness_pass).length,
    },
  }

  fs.writeFileSync(OUTPUT, JSON.stringify(report, null, 2) + "\n")
  console.log(JSON.stringify(report, null, 2))

  if (report.summary.failed_sources > 0) {
    throw new Error("One or more global real-time source freshness checks failed")
  }

  console.log("PASS: GLOBAL REALTIME SOURCE FRESHNESS PROOF COMPLETE - NO WRITES")
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
