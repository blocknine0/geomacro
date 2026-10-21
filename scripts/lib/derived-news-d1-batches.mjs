// Match the existing authenticated 64-KiB Worker ingress with UTF-8 headroom.
const schema='geomacro.website-derived-news-batch.v1';
const bytes=items=>new TextEncoder().encode(JSON.stringify({schema,signals:items})).byteLength;
export function prepareDerivedNewsBatches(input){
 const unique=new Map();
 for(const signal of input){
  const previous=unique.get(signal.id);
  if(previous&&JSON.stringify(previous)!==JSON.stringify(signal))throw Error('DERIVED_NEWS_DUPLICATE_ID_CONFLICT');
  if(!previous)unique.set(signal.id,signal);
 }
 const signals=[...unique.values()],chunks=[];let current=[];
 for(const signal of signals){
  if(bytes([signal])>60000)throw Error('DERIVED_NEWS_SINGLE_ITEM_TOO_LARGE');
  if(current.length===40||bytes([...current,signal])>60000){chunks.push(current);current=[];}
  current.push(signal);
 }
 if(current.length||!chunks.length)chunks.push(current);
 return {signals,chunks};
}
