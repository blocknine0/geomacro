/**
 * Existing canonical on-demand first-party page verifier extension:
 * narrowly recognize a Federal Reserve BOARD-authored discount-window MINUTES
 * publication. This is NOT a new rate action, independent economic-impact
 * attestation, rights certification, signing or payment authorization.
 *
 * The only input to this pure function is HTML already fetched from the
 * existing pinned, bounded HTTPS official original-page verifier.
 */
const FED_URL=/^\/newsevents\/pressreleases\/monetary(20\d{2})(\d{2})(\d{2})a\.htm$/u;
const TITLE=/^Minutes of the Board['\u2019]s discount rate meetings on (?:[A-Z][a-z]+ \d{1,2},?\s*(?:and\s*)?){1,3}.*20\d{2}$/u;
const PUBLICATION_TIME=/\bFor release at (1[0-2]|[1-9]):([0-5]\d)\s*(a\.m\.|p\.m\.)\s*(EDT|EST)\b/iu;
const MONTHS=["January","February","March","April","May","June","July",
 "August","September","October","November","December"];

function cleanText(html:string):string {
  // Linear, bounded first-party text extraction; never filter HTML with
  // a regexp (CodeQL js/bad-tag-filter). Script/style content is excluded,
  // including any forged announcement strings or release clocks there.
  const fragments:string[]=[];
  let offset=0,ignored:"script"|"style"|null=null;
  while(offset<html.length){
    const begin=html.indexOf("<",offset);
    if(begin<0){
      if(!ignored)fragments.push(html.slice(offset));
      break;
    }
    if(!ignored && begin>offset)fragments.push(html.slice(offset,begin));
    const end=html.indexOf(">",begin+1);
    if(end<0 || end-begin>2048)return "";
    const raw=html.slice(begin+1,end).trim().toLowerCase();
    const closing=raw.startsWith("/");
    const nameInput=closing?raw.slice(1):raw;
    let size=0;
    while(size<nameInput.length){
      const ch=nameInput.charCodeAt(size);
      if(ch<97||ch>122)break;
      size++;
    }
    const name=nameInput.slice(0,size);
    if(!ignored && !closing && (name==="script"||name==="style"))
      ignored=name;
    else if(ignored===name && closing)ignored=null;
    offset=end+1;
  }
  if(ignored)return "";
  return fragments.join(" ").replace(/&#(?:39|x27);|&apos;/giu,"'")
    .replace(/&(?:nbsp|#160);/giu," ")
    .replace(/&amp;/giu,"&").replace(/\\s+/gu," ").trim();
}

function norm(s:string):string {
  return s.normalize("NFKC").replace(/[\u2018\u2019]/gu,"'")
    .replace(/\s+/gu," ").trim();
}

/** Precise UTC timestamp ONLY if both original issuer's native feed clock AND
 * first-party original page's local, timezone-labelled release clock agree.
 * The parent verifier additionally checks any published-time <meta> conflicts.
 */
export function verifiedFedBoardDiscountMinutesOriginal(
  html:string, articleUrl:string, exactFeedTitle:string,
  nativeFeedPublishedAt:string|null, now=new Date(),
):Readonly<{
  publication_utc:string;
  verified_event:"FED_BOARD_DISCOUNT_WINDOW_MEETING_MINUTES_PUBLISHED";
  original_body_fact_verified:true;
  first_party_release_clock_verified:true;
  board_issued_release:true;
}>|null {
  if(typeof html!=="string"||html.length>384*1024 ||
     typeof exactFeedTitle!=="string"||exactFeedTitle.length>300 ||
     typeof nativeFeedPublishedAt!=="string" ||
     !Number.isFinite(now.getTime()) ||
     !TITLE.test(norm(exactFeedTitle)))return null;
  let url:URL;
  try{url=new URL(articleUrl);}catch{return null;}
  if(url.protocol!=="https:"||url.hostname!=="www.federalreserve.gov" ||
     url.search||url.hash||url.username||url.password||url.port)return null;
  const m=FED_URL.exec(url.pathname);
  if(!m)return null;
  const year=Number(m[1]),month=Number(m[2]),day=Number(m[3]);
  if(month<1||month>12||day<1||day>31||
    new Date(Date.UTC(year,month-1,day)).toISOString().slice(0,10)!==
    [m[1],m[2],m[3]].join("-"))return null;
  const text=norm(cleanText(html));
  const expected=norm(exactFeedTitle);
  if(!text.includes(expected) ||
     !text.includes(MONTHS[month-1]+" "+day+", "+year) ||
     !/\bThe Federal Reserve Board\b[\s\S]{0,130}\breleased the minutes\b/iu.test(text) ||
     !/\bdiscount rates\b[\s\S]{0,180}\bdiscount window\b/iu.test(text) ||
     !/\bBoard['\u2019]s process for setting the discount rate\b/iu.test(text))
    return null;
  const timeMatches=[...text.matchAll(new RegExp(PUBLICATION_TIME.source,"giu"))];
  if(timeMatches.length!==1)return null;
  const [,h,min,ap,zone]=timeMatches[0];
  let hour=Number(h)%12;if(ap.toLowerCase()==="p.m.")hour+=12;
  const offset=zone.toUpperCase()==="EDT"?"-04:00":"-05:00";
  const authored=[m[1],m[2],m[3]].join("-")+"T"+
    String(hour).padStart(2,"0")+":"+min+":00"+offset;
  const ms=Date.parse(authored),native=Date.parse(nativeFeedPublishedAt);
  if(!Number.isFinite(ms)||!Number.isFinite(native)||ms>now.getTime() ||
    now.getTime()-ms>31*86_400_000||Math.abs(ms-native)>10*60_000)return null;
  // Refuse a year-round fixed UTC-4/-5 guess. EDT/EST must be the genuine
  // New York timezone abbreviation for the claimed calendar date.
  const actual= new Intl.DateTimeFormat("en-US",{
    timeZone:"America/New_York",timeZoneName:"short",hour:"numeric"
  }).format(new Date(ms));
  if(!actual.includes(zone.toUpperCase()))return null;
  return Object.freeze({
    publication_utc:new Date(ms).toISOString(),
    verified_event:"FED_BOARD_DISCOUNT_WINDOW_MEETING_MINUTES_PUBLISHED" as const,
    original_body_fact_verified:true as const,
    first_party_release_clock_verified:true as const,
    board_issued_release:true as const,
  });
}
