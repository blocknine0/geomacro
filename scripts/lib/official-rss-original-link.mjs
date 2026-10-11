/**
 * Private first-party RSS link adapter.
 *
 * UN News RSS uses /feed/view/en/story/Y/M/ID as a feed routing link, while
 * <guid isPermaLink="true"> names /en/story/Y/M/ID. This is NOT a redirect
 * allowance: emit only a canonical same-publisher, exact-equal article GUID.
 * Unknown host, feed-relative URL, GUID mismatch, query or unsafe input fails.
 */
const UN_CANONICAL=/^\/en\/story\/([0-9]{4})\/(0?[1-9]|1[0-2])\/([a-z0-9][a-z0-9-]{2,160})\/?$/u;
const UN_FEED_VIEW=/^\/feed\/view\/en\/story\/([0-9]{4})\/(0?[1-9]|1[0-2])\/([0-9]{5,12})\/?$/u;
// ECB press RSS has historically published first-party hrefs with an
// accidental double slash immediately after the host. Normalize ONLY this
// exact ECB original press/key URL shape; never generic // or other paths.
const ECB_ORIGINAL=/^\/press\/(?:pr|key)\/date\/20[0-9]{2}\/html\/[a-zA-Z0-9.~_-]{6,190}\.html$/u;
function oneNativeXmlText(raw) {
  if(typeof raw!=="string"||raw.length>1900)return null;
  const value=raw.trim();
  if(value.startsWith("<![CDATA[")) {
    // Federal Reserve RSS wraps original first-party hrefs in a *single*
    // CDATA section. Accept only complete markup; never concatenate or
    // interpret arbitrary XML, and validate the resulting HTTPS URL later.
    const m=/^<!\[CDATA\[([\s\S]{1,1600})\]\]>$/u.exec(value);
    return m?.[1]?.trim()??null;
  }
  return value;
}
function firstTagValue(item,name) {
  const re=new RegExp("<"+name+"(?:\\s[^>]*)?>([\\s\\S]*?)<\\/"+name+">","iu");
  return oneNativeXmlText(item.match(re)?.[1]??null);
}
function strictUrl(raw, host, allowQuery=false) {
  if(typeof raw!=="string" || raw.length>1500)return null;
  try {
    const u=new URL(raw);
    if(u.protocol!=="https:" || u.hostname!==host || u.username||
       u.password||u.port||(!allowQuery&&u.search)||u.hash)return null;
    return u;
  } catch{return null;}
}
export function officialOriginalRssArticleUrl(item,source) {
  const link=firstTagValue(item,"link");
  if(source?.id==="ecb_press_original_rss_review") {
    const original=strictUrl(link,"www.ecb.europa.eu");
    if(!original)return null;
    const path=original.pathname.startsWith("//press/")
      ?original.pathname.slice(1):original.pathname;
    if(!ECB_ORIGINAL.test(path))return null;
    return "https://www.ecb.europa.eu"+path;
  }
  if(source?.id!=="un_news_security_original_rss_review")return link;
  const raw=strictUrl(link,"news.un.org",true);
  if(!raw)return null;
  // Previously valid canonical URL slugs/tracking queries must retain their
  // original behavior; the upstream canonicalOriginalUrl() still strips
  // tracking params before hashing and rejects unsafe hosts/fragments.
  if(UN_CANONICAL.test(raw.pathname))return raw.href;
  // A feed-routing link is never an article identity by itself; require an
  // exact same-ID permalink GUID and disallow feed-router query parameters.
  if(raw.search)return null;
  const feed=UN_FEED_VIEW.exec(raw.pathname);
  if(!feed)return null;
  const guidTag=item.match(/<guid\b([^>]*)>([\s\S]*?)<\/guid>/iu);
  if(!guidTag||!/\bisPermaLink\s*=\s*["']true["']/iu.test(guidTag[1]))
    return null;
  const canonical=strictUrl(oneNativeXmlText(guidTag[2]),"news.un.org");
  if(!canonical)return null;
  const match=UN_CANONICAL.exec(canonical.pathname);
  if(!match||match[1]!==feed[1]||Number(match[2])!==Number(feed[2])||
     match[3]!==feed[3])return null;
  return canonical.href;
}
