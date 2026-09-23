import {normalizeTelegramMessage,telegramCanConfirm} from "../telegram/normalize.mjs";

function assert(condition,message){if(!condition)throw new Error(message);}

const verified=normalizeTelegramMessage(
  {message_id:101,text:"Official update",date:"2026-09-23T00:00:00Z"},
  {source:{source_id:"telegram_verified_geopolitics",channel_id:"-1001",channel_name:"Official",identity_verified:true,authority_level:"OFFICIAL",policyApproved:true}}
);
assert(verified.verification_class==="TELEGRAM_VERIFIED","verified classification failed");
assert(telegramCanConfirm(verified),"verified Telegram should be eligible for confirmation");
assert(/^[a-f0-9]{64}$/.test(verified.content_hash),"content hash missing");

const specialist=normalizeTelegramMessage(
  {message_id:102,text:"Specialist signal"},
  {source:{source_id:"telegram_osint_geopolitics",authority_level:"SPECIALIST",identity_verified:false}}
);
assert(specialist.verification_class==="TELEGRAM_SPECIALIST","specialist classification failed");
assert(!telegramCanConfirm(specialist),"specialist Telegram must not independently confirm");

const unknown=normalizeTelegramMessage(
  {message_id:103,text:"Unknown signal"},
  {source:{source_id:"unknown_channel"}}
);
assert(unknown.verification_class==="TELEGRAM_EARLY_SIGNAL","unknown Telegram should be early signal");
assert(!telegramCanConfirm(unknown),"unknown Telegram must not confirm");

console.log(JSON.stringify({ok:true,classes:["TELEGRAM_VERIFIED","TELEGRAM_SPECIALIST","TELEGRAM_EARLY_SIGNAL"]}));
