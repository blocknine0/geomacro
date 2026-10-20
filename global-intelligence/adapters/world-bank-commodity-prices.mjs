import { createHash } from "node:crypto";

export const WORLD_BANK_PINK_SHEET_URL = "https://thedocs.worldbank.org/en/doc/74e8be41ceb20fa0da750cda2f6b9e4e-0050012026/related/CMO-Historical-Data-Monthly.xlsx";

export function normalizeCommodityRow({ commodity, period, value, unit = null, retrievedAt = new Date().toISOString() }) {
  if (!commodity || !period || !/^20\d{2}-(?:0[1-9]|1[0-2])$/.test(String(period)) || value == null || !Number.isFinite(Number(value))) throw new Error("Invalid World Bank commodity observation");
  const normalized = {
    source_id:"world_bank_commodity_prices",
    source_record_id:"WB-PINK:" + commodity + ":" + period,
    category:"MACRO",
    observed_at:retrievedAt,
    // Monthly market-statistic reference is never the issuer's release clock.
    published_at:null,
    observation_period:String(period),
    clock_semantics:"reference_month",
    native_publication_time_verified:false,
    metric:"commodity_price",
    value_numeric:Number(value),
    value_text:null,
    unit:unit || "World Bank Pink Sheet unit",
    commodity:String(commodity),
    event_type:"COMMODITY_PRICE",
    signal_type:"EXTERNAL_COMMODITY_PRICE",
    source_url:WORLD_BANK_PINK_SHEET_URL,
    provenance:{provider:"World Bank Prospects Group",dataset:"Commodity Markets / Pink Sheet",period}
  };
  normalized.raw_hash=createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
  return normalized;
}
