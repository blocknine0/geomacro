#!/usr/bin/env node
// Read-only comparison to the same production B2 D1 governor used by Hot50.
// No limit is raised automatically. R2 shadow transport incurs ZERO B2 ops.
import {B2_DAILY_LIMITS} from "../../workers/control-plane/src/b2-account-quota.mjs";
const url="https://api.geomacro.live/v1/b2-quota/status";
const bearer=String(process.env.GEOMACRO_STREAM_ADMIN_BEARER||"");
if(bearer.length<32)throw Error("B2_LIVE_ADMIN_AUTH_UNAVAILABLE");
const response=await fetch(url,{headers:{Authorization:"Bearer "+bearer},
 signal:AbortSignal.timeout(20000),redirect:"error"});
if(!response.ok)throw Error("B2_LIVE_QUOTA_HTTP_"+response.status);
const live=await response.json();
const keys=["total","GET","PUT","HEAD","NATIVE_AUTH"];
const day=new Date().toISOString().slice(0,10);
if(live?.ok!==true||live.schema!=="geomacro.b2-account-quota-status.v1"||
  live.day_utc!==day||!live.used||!live.limits||
  keys.some(k=>live.limits[k]!==B2_DAILY_LIMITS[k]||
    !Number.isSafeInteger(live.used[k])||live.used[k]<0||
    live.used[k]>B2_DAILY_LIMITS[k]))
 throw Error("HOT50_B2_LIVE_GOVERNOR_POLICY_DRIFT");
console.log(JSON.stringify({schema:"geomacro.shadow-b2-governor-parity.v1",
 status:"D1_SHARED_GOVERNOR_MATCH",day_utc:day,limits:B2_DAILY_LIMITS,
 used:live.used,mode:"PRIVATE_R2_ONLY",
 expected_b2_network_ops_for_shadow:0,
 provider_backblaze_telemetry_independently_verified:false,
 commercial_release_authorized:false}));
