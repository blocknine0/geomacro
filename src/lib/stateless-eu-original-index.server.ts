/**
 * Independent read-only EU Commission original-source landing-page adapter.
 * No DOM execution, off-host following, browser publication URLs or storage.
 * This is a bounded first-party news-index discovery lane, not a site scrape
 * pretending to guarantee all critical-minerals events.
 */
import { selectOfficialTopic, type StatelessSourceCandidate } from "./stateless-intelligence-model";

const PRESS_LINK = /<a\b[^>]{0,1000}href\s*=\s*["'](https:\/\/ec\.europa\.eu\/commission\/presscorner\/detail\/en\/ip_[0-9]{2}_[0-9]{3,7})["'][^>]{0,1000}>([\s\S]{0,1200}?)<\/a>/giu;
const MONTHS: Readonly<Record<string,number>> = {
  january:1, february:2, march:3, april:4, may:5, june:6,
  july:7, august:8, september:9, october:10, november:11, december:12,
};
const ENGLISH_DATE = /\b([1-9]|[12]\d|3[01])\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20[0-9]{2})\b/giu;

function textOnly(value: string): string {
  // Decode only once. Replacing &amp; before another entity decode can
  // turn encoded HTML into executable-looking or misleading publisher text.
  const entities: Record<string, string> = {
    "&amp;": "&", "&apos;": "'", "&quot;": '"', "&#39;": "'", "&#039;": "'",
  };
  return value.replace(/<[^>]*>/gu, " ")
    .replace(/&(?:amp|apos|quot|#0?39);/giu,
      raw => entities[raw.toLowerCase()] ?? raw)
    .replace(/\s+/gu, " ").trim();
}
export function euCommissionTopOriginalCandidates(html: string, now=Date.now()): {
  candidates: StatelessSourceCandidate[];
  inspected_links: number;
} {
  if(typeof html !== "string" || html.length > 512*1024 ||
     /<!DOCTYPE\s+[^>]*\[/iu.test(html))return {candidates:[],inspected_links:0};
  const candidates: StatelessSourceCandidate[]=[];
  const seen=new Set<string>();
  let inspected=0;
  for(const m of html.matchAll(PRESS_LINK)){
    if(++inspected>12)break;
    const original=m[1], title=textOnly(m[2]);
    if(title.length<12||title.length>300||
       !selectOfficialTopic(title,"rare_earth")||seen.has(original))continue;
    const prior=html.slice(Math.max(0,m.index-850),m.index);
    const dates=[...prior.matchAll(ENGLISH_DATE)];
    if(!dates.length)continue;
    const latest=dates.at(-1)!;
    if(latest.index+latest[0].length < prior.length-850)continue;
    const year=Number(latest[3]),month=MONTHS[latest[2].toLowerCase()],day=Number(latest[1]);
    const start=Date.UTC(year,month-1,day);
    const date=new Date(start).toISOString().slice(0,10);
    if(new Date(start).getUTCDate()!==day||
       now-start>30*86_400_000 || start>now)continue;
    seen.add(original);
    candidates.push({
      sourceId:"eu_top_news",category:"rare_earth",title,
      articleUrl:original,publishedAt:date,datePrecision:"day",
      credit:"European Commission",
    });
    if(candidates.length>=4)break;
  }
  return {candidates,inspected_links:inspected};
}
