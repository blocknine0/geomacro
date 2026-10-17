import {gzipSync} from 'node:zlib';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';

const NOW=Date.parse('2026-10-17T23:50:00.000Z');
beforeEach(()=>{
 vi.resetModules();vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(NOW);
 vi.stubEnv('B2_S3_ENDPOINT','https://s3.us-east-005.backblazeb2.com');
 vi.stubEnv('B2_ARCHIVE_READ_KEY_ID','offline-fixture-key');
 vi.stubEnv('B2_ARCHIVE_READ_APPLICATION_KEY','offline-fixture-secret');
 vi.stubEnv('GEOMACRO_CONTROL_PLANE_TOKEN','t'.repeat(64));
});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();vi.unstubAllEnvs()});
function reservation(){return Response.json({ok:true,
 schema:'geomacro.b2-account-request-reservation.v1',reserved:true,kind:'GET',
 b2_operation_performed:false,chargeable:false})}
function validStatus(){return new Response(gzipSync(JSON.stringify({
 schema:'geomacro.source-network-live.v1',source_project:'ldpwajisioljyjtojvfx',
 generated_at:new Date().toISOString(),data:{source_network_100_complete:false,
 gdelt_gal_freshness_complete:false,source_network_launch_complete:false},
})))}

describe('private B2 cooldown does not spend reservations or extend acceptance',()=>{
 it.each([
  [403,'transaction_cap_exceeded',10*60_000],
  [403,'download_cap_exceeded',10*60_000],
  [403,'AccessDenied',15*60_000],
  [429,'throttled',15*60_000],
 ])('holds after HTTP %i %s until its exact recovery boundary',async(status,code,delay)=>{
  let denied=false;
  const request=vi.fn(async(input:RequestInfo|URL)=>{
   if(String(input).endsWith('/v1/b2-quota/reserve'))return reservation();
   if(!denied){denied=true;return new Response(`<Error><Code>${code}</Code></Error>`,{status})}
   return validStatus();
  });
  vi.stubGlobal('fetch',request);
  const b2=await import('../lib/b2-live.server');
  expect(await b2.readB2SourceNetworkStatus()).toBeNull();
  expect(request).toHaveBeenCalledTimes(2);
  vi.setSystemTime(NOW+delay-1);
  expect(await b2.readB2CommercialSourceRights()).toBeNull();
  expect(await b2.readB2SourceNetworkStatus()).toBeNull();
  expect(request).toHaveBeenCalledTimes(2);
  vi.setSystemTime(NOW+delay);
  expect(await b2.readB2SourceNetworkStatus()).toMatchObject({source_network_launch_complete:false});
  expect(request).toHaveBeenCalledTimes(4);
 });
 it('reuses unexpired metadata during a hold, then rejects it when its normal cache TTL ends',async()=>{
  let reads=0;
  const request=vi.fn(async(input:RequestInfo|URL)=>{
   if(String(input).endsWith('/v1/b2-quota/reserve'))return reservation();
   return ++reads===1?validStatus():new Response('limited',{status:429});
  });
  vi.stubGlobal('fetch',request);
  const b2=await import('../lib/b2-live.server');
  expect(await b2.readB2SourceNetworkStatus()).not.toBeNull();
  expect(await b2.readB2CommercialSourceRights()).toBeNull();
  expect(await b2.readB2SourceNetworkStatus()).not.toBeNull();
  expect(request).toHaveBeenCalledTimes(4);
  vi.setSystemTime(NOW+120_001);
  expect(await b2.readB2SourceNetworkStatus()).toBeNull();
  expect(request).toHaveBeenCalledTimes(4);
 });
});
