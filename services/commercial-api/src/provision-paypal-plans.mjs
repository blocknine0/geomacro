import { PayPalClient } from './payments/paypal-client.mjs';
import { requireValue,uuid,usd } from './payments/common.mjs';
// Run deliberately in sandbox first. This creates product/plan configuration,
// not a subscription or charge. Keep setup ID stable across immediate retries.
const setup=process.env.PAYPAL_PROVISIONING_ID;
requireValue(uuid(setup),'PAYPAL_PROVISIONING_ID_MUST_BE_UUID',500);
const client=new PayPalClient({mode:process.env.PAYPAL_MODE,clientId:process.env.PAYPAL_CLIENT_ID,
 clientSecret:process.env.PAYPAL_CLIENT_SECRET,webhookId:process.env.PAYPAL_WEBHOOK_ID??'NOT_USED_FOR_PLAN_SETUP'});
try{
 const product=await client.call('/v1/catalogs/products',{method:'POST',requestId:setup,body:{
  name:'GeoMacro Risk Intelligence',description:'Advisory geopolitical and trade-corridor intelligence credits',type:'SERVICE',category:'SOFTWARE'}});
 const plans={};
 for(const [sku,cents]of [['monthly9',900],['monthly29',2900],['monthly99',9900]]){
  const plan=await client.call('/v1/billing/plans',{method:'POST',requestId:`${setup.slice(0,24)}-${sku}`,body:{
   product_id:product.id,name:`GeoMacro ${sku}`,status:'ACTIVE',
   billing_cycles:[{frequency:{interval_unit:'MONTH',interval_count:1},tenure_type:'REGULAR',sequence:1,total_cycles:0,
    pricing_scheme:{fixed_price:{currency_code:'USD',value:usd(cents)}}}],
   payment_preferences:{auto_bill_outstanding:false,setup_fee:{currency_code:'USD',value:'0.00'},
    setup_fee_failure_action:'CANCEL',payment_failure_threshold:3}}});
  plans[sku]=plan.id;
  // Print progress immediately to retain IDs if a later API call fails.
  console.log(JSON.stringify({sku,plan_id:plan.id,product_id:product.id}));
 }
}catch(error){console.error(error.code??'PAYPAL_PLAN_SETUP_FAILED');process.exitCode=1;}
