/**
 * Private first-party RSS link adapter.
 *
 * UN News RSS uses /feed/view/en/story/Y/M/ID as a feed routing link, while
 * <guid isPermaLink="true"> names /en/story/Y/M/ID. This is NOT a redirect
 * allowance: emit only a canonical same-publisher, exact-equal article GUID.
 * Unknown host, feed-relative URL, GUID mismatch, query or unsafe input fails.
 */
const UN_CANONICAL=/^\/en\/story\/([0-9]{4})\/(0?[1-9]|1[0-2])\/([0-9]{5,12})\/?$/u;
const UN_FEED_VIEW=/^\/feed\/view\/en\/story\/([0-9]{4})\/(0?[1-9]|1[0-2])\/([0-9]{5,12})\/?$/u;
function firstTagValue(item,name) {
  const re=new RegExp("<"+name+"(?:\\s[^>]*)?>([\\s\\S]*?)<\\/"+name+">","iu");
  return item.match(re)?.[1]?.trim()??null;
}
function strictUrl(raw, host) {
  if(typeof raw!=="string" || raw.length>1500)return null;
  try {
    const u=new URL(raw);
    if(u.protocol!=="https:" || u.hostname!==host || u.username||
       u.password||u.port||u.search||u.hash)return null;
    return u;
  } catch{return null;}
}
export function officialOriginalRssArticleUrl(item,source) {
  const link=firstTagValue(item,"link");
  if(source?.id!=="un_news_security_original_rss_review")return link;
  const raw=strictUrl(link,"news.un.org");
  if(!raw)return null;
  if(UN_CANONICAL.test(raw.pathname))return raw.href;
  const feed=UN_FEED_VIEW.exec(raw.pathname);
  if(!feed)return null;
  const guidTag=item.match(/<guid\b([^>]*)>([\s\S]*?)<\/guid>/iu);
  if(!guidTag||!/\bisPermaLink\s*=\s*["']true["']/iu.test(guidTag[1]))
    return null;
  const canonical=strictUrl(guidTag[2].trim(),"news.un.org");
  if(!canonical)return null;
  const match=UN_CANONICAL.exec(canonical.pathname);
  if(!match||match[1]!==feed[1]||Number(match[2])!==Number(feed[2])||
     match[3]!==feed[3])return null;
  return canonical.href;
}
