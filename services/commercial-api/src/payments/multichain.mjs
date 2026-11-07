/**
 * GeoMacro EIP-3009 multi-chain merchant rail. The no-funds deploy hard-disables
 * construction of this router; integration tests use fake facilitators/chain.
 * Owner must explicitly approve a later security-reviewed real-money canary.
 */
import { X402Engine } from './x402.mjs';
import { parsePayment } from './base.mjs';
import {
 POLYGON_NETWORK,polygonRequirements,validatePolygonAuthorization,
} from './polygon.mjs';
import { NETWORK } from './base.mjs';
import { PaymentError,requireValue,rpc } from './common.mjs';

export const POLYGON_X402_RAIL=Object.freeze({
 network:POLYGON_NETWORK,paymentRail:'polygon_usdc',
 requirements:polygonRequirements,validateAuthorization:validatePolygonAuthorization,
 ops:Object.freeze({
  get:'polygon_x402_get',prepare:'polygon_x402_prepare',
  claim:'polygon_x402_claim',note:'polygon_x402_note_tx',
  confirm:'polygon_x402_confirm',pending:'polygon_x402_pending',
 }),
});
export class PolygonX402Engine extends X402Engine {
 constructor({polygon,...options}) {
  requireValue(polygon&&typeof polygon.blockNumber==='function'&&
   typeof polygon.checkUnusedAndSimulate==='function'&&
   typeof polygon.confirm==='function','POLYGON_VERIFIER_REQUIRED',500);
  super({...options,base:polygon,rail:POLYGON_X402_RAIL});
 }
}
const encoded=value=>Buffer.from(JSON.stringify(value),'utf8').toString('base64');
/** An uncommitted request can offer multiple networks. Once prepared,
 * SQL and this router lock the request permanently to its original network. */
export class MultiChainX402Router {
 constructor({pool,base,polygon}) {
  requireValue(pool&&(base||polygon),'X402_RAILS_REQUIRED',500);
  this.pool=pool;this.base=base;this.polygon=polygon;
  if(base&&polygon)requireValue(base.payee===polygon.payee,'X402_RECIPIENT_MISMATCH',500);
 }
 async handle(input,header,options={}) {
  (this.base??this.polygon).validateInput(input);
  const [baseIntent,polygonIntent]=await Promise.all([
   this.base?rpc(this.pool,'x402_get',[input.request_id]):null,
   this.polygon?rpc(this.pool,'polygon_x402_get',[input.request_id]):null,
  ]);
  requireValue(!(baseIntent&&polygonIntent),'MULTI_CHAIN_REQUEST_CONFLICT',409);
  const selected=baseIntent?this.base:polygonIntent?this.polygon:null;
  if(selected)return selected.handle(input,header,options);
  if(header){
   const payment=parsePayment(header);
   const network=payment.accepted.network;
   const engine=network===NETWORK?this.base:network===POLYGON_NETWORK?this.polygon:null;
   requireValue(engine,'X402_NETWORK_NOT_CONFIGURED',402);
   return engine.handle(input,header,options);
  }
  const primary=this.base??this.polygon;
  const challenge=await primary.handle(input,null,options);
  if(challenge.status!==402||!this.base||!this.polygon)return challenge;
  const body=await challenge.json();
  requireValue(body.accepts?.length===1,'X402_CHALLENGE_INVALID',503);
  const source=body.accepts[0];
  body.accepts.push(polygonRequirements(source.amount,this.polygon.payee));
  return new Response(JSON.stringify(body),{status:402,headers:{
   'Content-Type':'application/json','Cache-Control':'no-store',
   'PAYMENT-REQUIRED':encoded(body),
  }});
 }
 async reconcile(limit=100) {
  return {
   base:this.base?await this.base.reconcile(limit):[],
   polygon:this.polygon?await this.polygon.reconcile(limit):[],
  };
 }
}
