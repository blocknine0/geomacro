import { PaymentError, requireValue, readJsonResponse } from './common.mjs';
export class PayPalClient {
  #token; #expires=0; #refresh;
  constructor({mode,clientId,clientSecret,webhookId,fetchImpl=fetch}) {
    requireValue(['sandbox','live'].includes(mode),'PAYPAL_MODE_REQUIRED',500);
    Object.assign(this,{mode,clientId:requireValue(clientId,'PAYPAL_CLIENT_ID_REQUIRED',500),
      clientSecret:requireValue(clientSecret,'PAYPAL_SECRET_REQUIRED',500),
      webhookId:requireValue(webhookId,'PAYPAL_WEBHOOK_ID_REQUIRED',500),fetch:fetchImpl.bind(globalThis)});
    this.origin=mode==='live'?'https://api-m.paypal.com':'https://api-m.sandbox.paypal.com';
  }
  async token() {
    if(this.#token && this.#expires>Date.now())return this.#token;
    if(!this.#refresh) this.#refresh=(async()=>{
      const response=await this.fetch(`${this.origin}/v1/oauth2/token`,{method:'POST',redirect:'manual',
        signal:AbortSignal.timeout(10_000),headers:{Authorization:`Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`,
        'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials'});
      if(!response.ok)throw new PaymentError('PAYPAL_AUTH_UNAVAILABLE');
      const data=await readJsonResponse(response);
      requireValue(typeof data.access_token==='string' && Number.isFinite(data.expires_in) && data.expires_in>60,'PAYPAL_TOKEN_INVALID');
      this.#token=data.access_token;this.#expires=Date.now()+(data.expires_in-60)*1000;return this.#token;
    })().finally(()=>{this.#refresh=undefined;});
    return this.#refresh;
  }
  async call(path,{method='GET',body,requestId}={}) {
    requireValue(path.startsWith('/v1/')||path.startsWith('/v2/'),'INVALID_PAYPAL_PATH',500);
    const response=await this.fetch(`${this.origin}${path}`,{method,redirect:'manual',signal:AbortSignal.timeout(15_000),
      headers:{Authorization:`Bearer ${await this.token()}`,'Content-Type':'application/json',
        ...(requestId?{'PayPal-Request-Id':requestId}:{}),Prefer:'return=representation'},
      ...(body!==undefined?{body:JSON.stringify(body)}:{})});
    if(!response.ok)throw new PaymentError(`PAYPAL_HTTP_${response.status}`,response.status===422?422:503);
    if(response.status===204)return {};
    return readJsonResponse(response);
  }
  async verifyWebhook(headers,event) {
    const names=['paypal-auth-algo','paypal-cert-url','paypal-transmission-id','paypal-transmission-sig','paypal-transmission-time'];
    for(const name of names)requireValue(headers.get(name), 'PAYPAL_SIGNATURE_HEADERS_REQUIRED',401);
    const result=await this.call('/v1/notifications/verify-webhook-signature',{method:'POST',body:{
      auth_algo:headers.get(names[0]),cert_url:headers.get(names[1]),transmission_id:headers.get(names[2]),
      transmission_sig:headers.get(names[3]),transmission_time:headers.get(names[4]),webhook_id:this.webhookId,webhook_event:event}});
    requireValue(result.verification_status==='SUCCESS','PAYPAL_SIGNATURE_INVALID',401);
  }
}
