import { hash, canonicalize } from '../metering.mjs';
import { PaymentError,requireValue,rpc,uuid,cents,usd } from './common.mjs';
const id=value=>{requireValue(typeof value==='string'&&/^[A-Za-z0-9-]{2,128}$/.test(value),'INVALID_PAYPAL_ID',400);return encodeURIComponent(value);};
export class PayPalEngine {
 constructor({pool,client,catalog,merchantId,siteOrigin}) {
  const origin=new URL(siteOrigin);requireValue(origin.protocol==='https:'&&origin.origin===siteOrigin,'HTTPS_SITE_ORIGIN_REQUIRED',500);
  Object.assign(this,{pool,client,catalog,merchantId:requireValue(merchantId,'PAYPAL_MERCHANT_ID_REQUIRED',500),siteOrigin});
 }
 async validatePlan(product) {
  const p=await this.client.call(`/v1/billing/plans/${id(product.plan_id)}`);
  const cycles=p.billing_cycles, prefs=p.payment_preferences;
  requireValue(p.id===product.plan_id && p.status==='ACTIVE' && Array.isArray(cycles)&&cycles.length===1,'PAYPAL_PLAN_MISMATCH',422);
  const cycle=cycles[0],fixed=cycle.pricing_scheme?.fixed_price;
  requireValue(cycle.tenure_type==='REGULAR'&&cycle.frequency?.interval_unit==='MONTH'&&cycle.frequency.interval_count===1&&
    cycle.sequence===1&&cycle.total_cycles===0&&fixed?.currency_code==='USD'&&cents(fixed.value)===product.usd_cents&&
    !cycle.pricing_scheme?.tiers?.length && (!prefs?.setup_fee||cents(prefs.setup_fee.value)===0)&&
    (!p.taxes || Number(p.taxes.percentage)===0)&&p.quantity_supported!==true,'PAYPAL_PLAN_PRICE_MISMATCH',422);
 }
 async create({userId,requestId,sku,kind}) {
  requireValue(uuid(userId)&&uuid(requestId),'INVALID_ID',400);
  const product=this.catalog[sku];requireValue(product&&product.kind===kind,'INVALID_SKU',400);
  const purchase=await rpc(this.pool,'paypal_begin',[requestId,userId,sku,kind,product.usd_cents,product.credit_units,product.plan_id]);
  if(purchase.provider_id)return this.publicPurchase(purchase);
  // PayPal idempotency retention is finite; do not silently recreate uncertain purchases later.
  requireValue(Date.now()-Date.parse(purchase.created_at)<5*3600_000,'PURCHASE_RECONCILIATION_REQUIRED',409);
  let remote;
  if(kind==='pack') remote=await this.client.call('/v2/checkout/orders',{method:'POST',requestId,body:{intent:'CAPTURE',
    purchase_units:[{reference_id:requestId,custom_id:requestId,payee:{merchant_id:this.merchantId},
      amount:{currency_code:'USD',value:usd(product.usd_cents)}}],
    payment_source:{paypal:{experience_context:{user_action:'PAY_NOW',shipping_preference:'NO_SHIPPING',
      return_url:`${this.siteOrigin}/billing/paypal/return`,cancel_url:`${this.siteOrigin}/billing/paypal/cancel`}}}}});
  else {
    await this.validatePlan(product);
    remote=await this.client.call('/v1/billing/subscriptions',{method:'POST',requestId,body:{plan_id:product.plan_id,
      custom_id:requestId,application_context:{user_action:'SUBSCRIBE_NOW',shipping_preference:'NO_SHIPPING',
      return_url:`${this.siteOrigin}/billing/paypal/return`,cancel_url:`${this.siteOrigin}/billing/paypal/cancel`}}});
  }
  const link=remote.links?.find(l=>['approve','payer-action'].includes(l.rel))?.href;
  requireValue(typeof remote.id==='string'&&typeof remote.status==='string','PAYPAL_CREATE_INVALID');
  const approval=link?new URL(link):null;
  requireValue(approval?.protocol==='https:'&&['www.paypal.com','www.sandbox.paypal.com'].includes(approval.hostname),'PAYPAL_APPROVAL_URL_INVALID');
  const linked=await rpc(this.pool,'paypal_link',[requestId,remote.id,remote.status,link]);
  return this.publicPurchase(linked);
 }
 publicPurchase(v){return {purchase_id:v.id,provider_id:v.provider_id,status:v.state,approval_url:v.approval_url};}
 async purchase(providerId,userId){
  const v=await rpc(this.pool,'paypal_get',[providerId,null]);
  requireValue(v&&v.user_id===userId,'PURCHASE_NOT_FOUND',404);return v;
 }
 async capture({orderId,userId}) {
  const p=await this.purchase(orderId,userId);requireValue(p.kind==='pack','WRONG_PAYMENT_KIND',400);
  // A repeated capture reads the completed order first instead of issuing a new capture.
  let order=await this.client.call(`/v2/checkout/orders/${id(orderId)}`);
  if(order.status!=='COMPLETED')order=await this.client.call(`/v2/checkout/orders/${id(orderId)}/capture`,
    {method:'POST',requestId:p.id,body:{}});
  const captures=order.purchase_units?.flatMap(u=>u.payments?.captures??[])??[];
  requireValue(captures.length===1&&captures[0].status==='COMPLETED','PAYPAL_CAPTURE_PENDING',409);
  const captureId=captures[0].id;
  await this.processCapture(captureId,{id:`sync:${captureId}`,event_type:'SYNC.CAPTURE.COMPLETED'});
  return {status:'COMPLETED',capture_id:captureId};
 }
 async apply(p,event,resource,provider,state) {
  await rpc(this.pool,'paypal_apply',[p.id,event.id,hash(canonicalize(event)),event.event_type,resource,provider,state]);
 }
 async processCapture(captureId,event) {
  // Re-fetch canonical resource using our app credentials; never credit a webhook body alone.
  const capture=await this.client.call(`/v2/payments/captures/${id(captureId)}`);
  requireValue(capture.id===captureId&&capture.status==='COMPLETED','PAYPAL_CAPTURE_NOT_COMPLETED',409);
  const orderId=capture.supplementary_data?.related_ids?.order_id;
  requireValue(orderId,'PAYPAL_CAPTURE_ORDER_MISSING',422);
  const p=await rpc(this.pool,'paypal_get',[orderId,null]);requireValue(p&&p.kind==='pack','PURCHASE_NOT_FOUND',404);
  const order=await this.client.call(`/v2/checkout/orders/${id(orderId)}`),units=order.purchase_units;
  requireValue(order.id===orderId&&order.status==='COMPLETED'&&Array.isArray(units)&&units.length===1,'PAYPAL_ORDER_MISMATCH',422);
  const unit=units[0], captures=unit.payments?.captures??[];
  requireValue(unit.custom_id===p.id&&unit.reference_id===p.id&&unit.payee?.merchant_id===this.merchantId&&
    captures.length===1&&captures[0].id===captureId&&captures[0].status==='COMPLETED'&&
    capture.amount?.currency_code==='USD'&&cents(capture.amount.value)===p.usd_cents&&
    unit.amount?.currency_code==='USD'&&cents(unit.amount.value)===p.usd_cents,'PAYPAL_CAPTURE_MISMATCH',422);
  await this.apply(p,event,captureId,'paypal_capture','COMPLETED');
 }
 async processSubscription(event,{payment=false}={}) {
  const resource=event.resource;
  const subId=payment?resource?.billing_agreement_id:resource?.id;
  requireValue(subId,'SUBSCRIPTION_ID_REQUIRED',422);
  const p=await rpc(this.pool,'paypal_get',[subId,null]);requireValue(p&&p.kind==='subscription','PURCHASE_NOT_FOUND',404);
  const sub=await this.client.call(`/v1/billing/subscriptions/${id(subId)}`);
  requireValue(sub.id===subId&&sub.custom_id===p.id&&sub.plan_id===p.plan_id,'PAYPAL_SUBSCRIPTION_MISMATCH',422);
  requireValue(!sub.quantity||sub.quantity==='1','PAYPAL_SUBSCRIPTION_QUANTITY_MISMATCH',422);
  if(!payment){await this.apply(p,event,subId,null,sub.status);return;}
  const created=Date.parse(resource.create_time);requireValue(Number.isFinite(created),'PAYMENT_TIME_REQUIRED',422);
  const start=new Date(created-86400_000).toISOString(),end=new Date(created+86400_000).toISOString();
  const records=await this.client.call(`/v1/billing/subscriptions/${id(subId)}/transactions?start_time=${encodeURIComponent(start)}&end_time=${encodeURIComponent(end)}`);
  const tx=records.transactions?.find(t=>t.id===resource.id);
  requireValue(tx&&tx.status==='COMPLETED'&&tx.amount_with_breakdown?.gross_amount?.currency_code==='USD'&&
    cents(tx.amount_with_breakdown.gross_amount.value)===p.usd_cents,'PAYPAL_SUBSCRIPTION_PAYMENT_MISMATCH',422);
  await this.apply(p,event,tx.id,'paypal_subscription_payment',sub.status);
 }
 async webhook(headers,raw) {
  let event;try{event=JSON.parse(raw);}catch{throw new PaymentError('INVALID_JSON',400);}
  requireValue(event&&typeof event.id==='string'&&typeof event.event_type==='string','INVALID_EVENT',400);
  await this.client.verifyWebhook(headers,event);
  switch(event.event_type){
   case 'PAYMENT.CAPTURE.COMPLETED':await this.processCapture(event.resource?.id,event);break;
   case 'PAYMENT.SALE.COMPLETED':await this.processSubscription(event,{payment:true});break;
   case 'BILLING.SUBSCRIPTION.ACTIVATED':
   case 'BILLING.SUBSCRIPTION.CANCELLED':
   case 'BILLING.SUBSCRIPTION.SUSPENDED':
   case 'BILLING.SUBSCRIPTION.EXPIRED':await this.processSubscription(event);break;
   default:return {accepted:true,ignored:true};
  }
  return {accepted:true};
 }
}
