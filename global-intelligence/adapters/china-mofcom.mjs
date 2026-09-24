import { createHash } from "node:crypto";

export const CHINA_MOFCOM_URL = "https://english.mofcom.gov.cn/Policies/index.html";

export function normalizeMofcomExportControl({ id, title, issuedAt = null, url = CHINA_MOFCOM_URL, commodity = null, controlAction = "EXPORT_CONTROL", retrievedAt = new Date().toISOString(), raw = null }) {
  if (!title) throw new Error("MOFCOM record requires title");
  const key = String(id ?? title).trim().replace(/\s+/g, "_");
  const rawPayload = raw ?? { id, title, issuedAt, commodity, controlAction, url };
  return {
    source_id:"china_mofcom_trade_controls",
    source_record_id:"MOFCOM:" + key,
    category:"CRITICAL_MINERALS",
    country_iso3:"CHN",
    observed_at:retrievedAt,
    published_at:issuedAt ? new Date(issuedAt).toISOString() : retrievedAt,
    title:"China trade control: " + title,
    summary:"China Ministry of Commerce trade/export-control notice.",
    source_url:url,
    metric:"trade_control_action",
    value_numeric:1,
    value_text:controlAction,
    unit:"policy action",
    commodity,
    event_type:"EXPORT_CONTROL",
    signal_type:"CRITICAL_MINERALS_TRADE_CONTROL",
    provenance:{provider:"Ministry of Commerce of the People's Republic of China",dataset:"MOFCOM Policies / Announcements",id:String(id ?? ""),commodity:String(commodity ?? "")},
    raw_payload:rawPayload,
    raw_hash:createHash("sha256").update(JSON.stringify(rawPayload)).digest("hex")
  };
}
