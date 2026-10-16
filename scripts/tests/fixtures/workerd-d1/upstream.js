let requests=0,escaped=0;
export default {async fetch(request){
 const url=new URL(request.url);
 if(url.hostname==='redirect-target.example.test')escaped++;
 if(url.pathname==='/counts')return Response.json({requests,escaped});
 requests++;
 if(url.pathname.startsWith('/redirect/'))return new Response(null,{status:Number(url.pathname.split('/').pop()),headers:{Location:'https://redirect-target.example.test/private'}});
 if(url.pathname==='/v1/security/budget'){
  if(!/^Bearer [a-f0-9]{64}$/.test(request.headers.get('authorization')??''))throw Error('AUTH_NOT_BOUND');
  const body=await request.json();
  return Response.json({ok:true,schema:'geomacro.central-security-budget.v1',store:'d1',route_class:body.route_class,allowed:true,retry_after_seconds:60});
 }
 if(url.pathname==='/v1/public/automated-finds')return Response.json({ok:true,schema:'geomacro.automated-finds-feed.v1',independent_reviewed:false,scored:false,chargeable:false,supabase_dependency:false,full_b2_readback_verified:false,exact_gzip_restore_verified:false,batches:[{},{},{}]});
 return new Response('ok');
}};
