import {buildNewsProductPacket,NEWS_PRODUCT_FACTORY_VERSION} from '../../../src/lib/news-product-factory.ts';
import {validateReusableSourceNewsItem} from './reusable-source-news.mjs';
const json=(body,status=200)=>Response.json(body,{status,headers:{
  'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
}});
/** Authenticated operator-only reader. The existing bounded D1 news journal
 * is the durable input; deterministic packets need no duplicate row or cron.
 * Never expose the drafts or private facts on a public/free API. */
export async function readNewsProductFactory(env,query,now=Date.now()){
  if(!Number.isFinite(now)||[...query.keys()].some(k=>!['id','country','before','before_id','limit'].includes(k))||
    [...query.keys()].some(k=>query.getAll(k).length!==1))
    return json({ok:false,error:'NEWS_FACTORY_QUERY_INVALID'},400);
  const id=query.get('id'),country=query.get('country'),before=query.get('before'),beforeId=query.get('before_id');
  const limit=Number(query.get('limit')??'10');
  if(!Number.isSafeInteger(limit)||limit<1||limit>40||
    (query.has('id')&&!id)||(query.has('country')&&!country)||
    (id&&!/^[a-f0-9]{64}$/.test(id))||(country&&!/^[A-Z]{3}$/.test(country))||
    Boolean(before)!==Boolean(beforeId)||(before&&(!Number.isFinite(Date.parse(before))||!/^\d{4}-\d\d-\d\dT/.test(before)))||
    (beforeId&&!/^[a-f0-9]{64}$/.test(beforeId))||(id&&(before||country)))
    return json({ok:false,error:'NEWS_FACTORY_QUERY_INVALID'},400);
  const where=['published_at >= ?','published_at <= ?'];
  const params=[new Date(now-25*3600_000).toISOString(),new Date(now).toISOString()];
  if(id){where.push('item_id = ?');params.push(id)}
  if(country){where.push("json_extract(projection_json,'$.country_iso3') = ?");params.push(country)}
  if(before){where.push('(published_at < ? OR (published_at = ? AND item_id < ?))');params.push(before,before,beforeId)}
  try{
    const result=await env.DB.prepare('SELECT item_id,published_at,projection_json FROM reusable_news_items WHERE '+
      where.join(' AND ')+' ORDER BY published_at DESC,item_id DESC LIMIT ?').bind(...params,limit+1).all();
    const rows=result.results;
    if(!Array.isArray(rows))throw Error();
    const page=rows.slice(0,limit),packets=[];
    for(const row of page){const news=JSON.parse(row.projection_json);
      if(news.id!=='news-'+row.item_id||news.source.original_published_at!==row.published_at)throw Error();
      validateReusableSourceNewsItem(news,now);packets.push(await buildNewsProductPacket(news,{now}));}
    const last=page.at(-1);
    return json({ok:true,schema:NEWS_PRODUCT_FACTORY_VERSION,packets,count:packets.length,
      next:rows.length>limit?{before:last.published_at,before_id:last.item_id}:null,
      canonical_input:'EXISTING_D1_REUSABLE_NEWS_JOURNAL',extra_ingestion:false,
      product_drafts_are_not_qualified_sales:true,payment_authorized:false});
  }catch{return json({ok:false,error:'NEWS_FACTORY_CANONICAL_INPUT_UNAVAILABLE',payment_authorized:false},503);}
}
