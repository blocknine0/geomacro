const API = "https://kidb.adb.org/api"

function walkObjects(node, visit) {
  if (!node || typeof node !== "object") return
  if (!Array.isArray(node)) visit(node)
  for (const value of Object.values(node)) {
    if (value && typeof value === "object") walkObjects(value, visit)
  }
}

function objectCode(object) {
  for (const key of ["id", "code", "value", "key"]) {
    const value = object?.[key]
    if (typeof value === "string" && /^[A-Z][A-Z0-9_]{1,80}$/.test(value)) return value
  }
  return null
}

function objectText(object) {
  return Object.values(object ?? {})
    .filter((value) => typeof value === "string")
    .join(" | ")
}

const response = await fetch(`${API}/dataflow/indicators/DF_NA`, {
  headers: { accept: "application/json", "user-agent": "Geomacro-ADB-GDP-Metadata-Discovery/1.0" },
})
if (!response.ok) throw new Error(`HTTP ${response.status}`)
const payload = await response.json()
const rows = []
const seen = new Set()
walkObjects(payload, (object) => {
  const code = objectCode(object)
  if (!code || seen.has(code)) return
  const text = objectText(object)
  if (!/(gross domestic product|(^|\W)gdp(\W|$))/i.test(text)) return
  seen.add(code)
  rows.push({ code, text: text.slice(0, 2200), raw: object })
})
console.log(JSON.stringify({ dataflow: "DF_NA", gdp_like_count: rows.length, rows }, null, 2))
if (!rows.length) process.exit(2)
