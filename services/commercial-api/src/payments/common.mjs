export class PaymentError extends Error {
  constructor(code, status=503, cause) { super(code,{cause}); this.code=code; this.status=status; }
}
export function requireValue(value,code,status=503) { if(!value) throw new PaymentError(code,status); return value; }
export const uuid = value => typeof value==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export async function rpc(pool,name,args=[]) {
  // name is always a source-code constant, never a request parameter.
  if(!/^[a-z0-9_]+$/.test(name)) throw new Error('Invalid internal function name');
  const {rows}=await pool.query(`SELECT geomacro.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) AS result`,args);
  return rows[0]?.result;
}
export async function readJsonResponse(response, maxBytes=1_048_576) {
  const reader=response.body?.getReader(); if(!reader) throw new PaymentError('EMPTY_UPSTREAM_RESPONSE');
  let size=0; const chunks=[];
  try { for(;;) {const {done,value}=await reader.read();if(done)break;size+=value.length;
    if(size>maxBytes) throw new PaymentError('UPSTREAM_RESPONSE_TOO_LARGE'); chunks.push(Buffer.from(value));}
  } finally { await reader.cancel().catch(()=>{}); }
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch(error){throw new PaymentError('INVALID_UPSTREAM_JSON',503,error);}
}
export function cents(value) {
  if(typeof value!=='string' || !/^\d+(?:\.\d{1,2})?$/.test(value)) throw new PaymentError('INVALID_MONEY',422);
  const [whole,fraction='']=value.split('.');
  const amount=BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0')); if(amount>BigInt(Number.MAX_SAFE_INTEGER)) throw new PaymentError('INVALID_MONEY',422);
  return Number(amount);
}
export const usd = amount => `${Math.floor(amount/100)}.${String(amount%100).padStart(2,'0')}`;
