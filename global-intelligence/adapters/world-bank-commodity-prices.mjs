import { createHash } from "node:crypto";

export const WORLD_BANK_PINK_SHEET_URL = "https://thedocs.worldbank.org/en/doc/74e8be41ceb20fa0da750cda2f6b9e4e-0050012026/related/CMO-Historical-Data-Monthly.xlsx";
export const WORLD_BANK_COMMODITY_MARKETS_URL = "https://www.worldbank.org/en/research/commodity-markets";

/** Extract the dated Pink Sheet publication label from the World Bank publisher page.
 * Never infer a release date from XLSX observations or their reference months.
 */
export function parseWorldBankPinkSheetReleaseMetadata(html){
 const input=String(html??"");
 if(input.length>2*1024*1024)throw Error("WORLD_BANK_RELEASE_METADATA_TOO_LARGE");
 if(!/World Bank|Commodity Markets/iu.test(input))
  throw Error("WORLD_BANK_RELEASE_METADATA_MARKER_MISSING");
 const text=input.replace(/<script\b[\s\S]*?<\/script>/giu," ")
  .replace(/<style\b[\s\S]*?<\/style>/giu," ")
  .replace(/<[^>]+>/gu," ").replace(/&nbsp;|&#160;/giu," ")
  .replace(/&amp;/giu,"&").replace(/\s+/gu," ").trim();
 const label=text.search(/Latest Commodity Prices Published/iu);
 if(label<0)throw Error("WORLD_BANK_PINK_SHEET_RELEASE_LABEL_MISSING");
 const context=text.slice(label,Math.min(text.length,label+900));
 const match=context.match(/(?:\(|\b)(\d{1,2})\/(\d{1,2})\/(20\d{2})(?:\)|\b)/u);
 if(!match)throw Error("WORLD_BANK_PINK_SHEET_RELEASE_DATE_MISSING");
 const month=Number(match[1]),day=Number(match[2]),year=Number(match[3]);
 const iso=year+"-"+String(month).padStart(2,"0")+"-"+String(day).padStart(2,"0");
 const date=new Date(iso+"T00:00:00.000Z");
 if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==iso)
  throw Error("WORLD_BANK_PINK_SHEET_RELEASE_DATE_INVALID");
 return Object.freeze({published_at:date.toISOString(),publisher_release_date:iso,
  clock_source:"WORLD_BANK_COMMODITY_MARKETS_LATEST_RELEASE_CARD",native_publication_time_verified:true});
}

export function normalizeCommodityRow({ commodity, period, value, unit = null, retrievedAt = new Date().toISOString(), publisherMetadata = null }) {
  if (!commodity || !period || !/^20\d{2}-(?:0[1-9]|1[0-2])$/.test(String(period)) || value == null || !Number.isFinite(Number(value))) throw new Error("Invalid World Bank commodity observation");
  const publisherClock=publisherMetadata===null?null:parseWorldBankPinkSheetReleaseMetadata(publisherMetadata);
  const normalized = {
    source_id:"world_bank_commodity_prices",
    source_record_id:"WB-PINK:" + commodity + ":" + period,
    category:"MACRO",
    observed_at:retrievedAt,
    // Monthly market-statistic reference is never the issuer's release clock.
    published_at:publisherClock?.published_at??null,
    observation_period:String(period),
    clock_semantics:"reference_month",
    native_publication_time_verified:publisherClock?.native_publication_time_verified??false,
    publisher_release_date:publisherClock?.publisher_release_date??null,
    publication_clock_source:publisherClock?.clock_source??null,
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
