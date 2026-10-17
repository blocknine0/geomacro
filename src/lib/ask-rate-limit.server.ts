/**
 * Best-effort per-IP burst protection for the public Ask Geomacro surface.
 *
 * This intentionally does not claim durable distributed rate limiting. A
 * database-backed quota is a later production gate; this limiter prevents a
 * single warm runtime from accepting an unbounded burst in the meantime.
 */
const RATE_BUCKET = new Map<string, { count: number; reset: number }>();
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;

export function checkAskRateLimit(ip: string) {
  const now = Date.now();
  const entry = RATE_BUCKET.get(ip);

  if (!entry || entry.reset < now) {
    RATE_BUCKET.set(ip, { count: 1, reset: now + RATE_WINDOW_MS });
    return true;
  }

  entry.count += 1;
  return entry.count <= RATE_LIMIT;
}


/**
 * Conservative per-warm-runtime budget for expensive question-scoped original
 * publisher fanout. Not a distributed quota claim; existing edge guards remain
 * authoritative. Max three public discovery calls/client and 24/runtime/minute.
 */
const ORIGINAL_RATE_WINDOW_MS = 60_000;
const ORIGINAL_CLIENT_MAX = 3;
const ORIGINAL_GLOBAL_MAX = 24;
const originalClients = new Map<string,{count:number;reset:number}>();
let originalGlobal = {count:0,reset:0};
export function checkAskOriginalBudget(client:string,now=Date.now()):boolean{
  if(!client||!Number.isFinite(now))return false;
  if(originalGlobal.reset<=now)originalGlobal={count:0,reset:now+ORIGINAL_RATE_WINDOW_MS};
  if(originalGlobal.count>=ORIGINAL_GLOBAL_MAX)return false;
  const old=originalClients.get(client);
  const slot=!old||old.reset<=now?{count:0,reset:now+ORIGINAL_RATE_WINDOW_MS}:old;
  if(slot.count>=ORIGINAL_CLIENT_MAX)return false;
  slot.count++;
  originalClients.set(client,slot);
  originalGlobal.count++;
  if(originalClients.size>1024){
    for(const [key,value] of originalClients){
      if(value.reset<=now)originalClients.delete(key);
    }
    while(originalClients.size>1024)originalClients.delete(originalClients.keys().next().value!);
  }
  return true;
}
