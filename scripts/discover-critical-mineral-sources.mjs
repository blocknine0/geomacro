console.log(
  "===== CRITICAL MINERAL SOURCE DISCOVERY ====="
)

const jrcUrl =
  "https://data.jrc.ec.europa.eu/dataset/496f1938-7c7b-4173-b504-79542467a390"

const jrcResponse =
  await fetch(
    jrcUrl,
    {
      redirect:
        "follow",
    },
  )

if (!jrcResponse.ok) {
  throw new Error(
    `JRC dataset unavailable: ${jrcResponse.status}`
  )
}

const html =
  await jrcResponse.text()

const assetPatterns = [
  /https?:[^"'<> ]+\.csv[^"'<> ]*/gi,
  /https?:[^"'<> ]+\.xlsx[^"'<> ]*/gi,
  /https?:[^"'<> ]+\.json[^"'<> ]*/gi,
  /https?:[^"'<> ]+\.zip[^"'<> ]*/gi,
]

const assets =
  [
    ...new Set(
      assetPatterns
        .flatMap(
          pattern =>
            html.match(
              pattern
            ) ?? []
        )
        .map(
          value =>
            value
              .replace(
                /&amp;/g,
                "&"
              )
        )
    ),
  ]

console.log({
  source_id:
    "jrc_rmis_supply_chain",

  http_status:
    jrcResponse.status,

  machine_readable_assets:
    assets,
})

if (!assets.length) {
  console.log(
    "PASS: JRC reachable; no machine-readable asset auto-discovered, ingestion remains fail-closed"
  )
} else {
  console.log(
    "PASS: JRC machine-readable assets discovered"
  )
}


//
// IEA intentionally disabled for automated
// ingestion while direct access returns 403.
//

const iea =
  await fetch(
    "https://www.iea.org/data-and-statistics/data-product/critical-minerals-dataset"
  )

console.log({
  source_id:
    "iea_critical_minerals",

  status:
    iea.status,

  automated_ingestion:
    false,
})

console.log(
  "PASS: CRITICAL MINERAL SOURCE DISCOVERY COMPLETE"
)
