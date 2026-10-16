import {describe,it,expect,vi} from 'vitest';
import {fetchWithoutRedirectUsing} from '../lib/fetch-without-redirect';
describe('workerd-compatible no-redirect transport',()=>{
 it.each([300,301,302,303,304,305,306,307,308])('rejects HTTP %s once without following secret-bearing Location',async status=>{
  let cancelled=false;
  const body=status===304?null:new ReadableStream({cancel(){cancelled=true;}});
  const response=new Response(body,{status,headers:{Location:'https://untrusted.invalid/?private=fixture'}});
  const transport=vi.fn(async()=>response);
  await expect(fetchWithoutRedirectUsing(transport,'https://fixed.invalid/',{method:'POST',body:'one reservation',headers:{Authorization:'Bearer fixture'},redirect:'error'})).rejects.toThrow('UPSTREAM_REDIRECT_REJECTED');
  expect(transport).toHaveBeenCalledTimes(1);
  expect(transport.mock.calls[0]).toEqual(['https://fixed.invalid/',{method:'POST',body:'one reservation',headers:{Authorization:'Bearer fixture'},redirect:'manual'}]);
  if(body)expect(cancelled).toBe(true);
 });
 it('preserves status/body, deadline and headers and never retries transport failure',async()=>{
  const signal=AbortSignal.timeout(1000),response=Response.json({ok:false},{status:429});
  const transport=vi.fn(async()=>response);
  expect(await fetchWithoutRedirectUsing(transport,'https://fixed.invalid/',{signal})).toBe(response);
  expect(transport.mock.calls[0][1]).toEqual({signal,redirect:'manual'});
  const failure=vi.fn(async()=>{throw Error('private details');});
  await expect(fetchWithoutRedirectUsing(failure,'https://fixed.invalid/')).rejects.toThrow('private details');
  expect(failure).toHaveBeenCalledTimes(1);
 });
});
