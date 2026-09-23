import {createHash} from "node:crypto";

const VERIFIED="TELEGRAM_VERIFIED";
const SPECIALIST="TELEGRAM_SPECIALIST";
const EARLY="TELEGRAM_EARLY_SIGNAL";

function sha256(value){return createHash("sha256").update(String(value ?? "")).digest("hex");}

export function classifyTelegramSource({identityVerified=false,authorityLevel=null,policyApproved=false}={}){
  const authority=String(authorityLevel || "").toUpperCase();
  if(identityVerified && policyApproved && (authority==="OFFICIAL" || authority==="AUTHORITATIVE" || authority==="VERIFIED_OFFICIAL")) return VERIFIED;
  if(authority==="SPECIALIST") return SPECIALIST;
  return EARLY;
}

export function normalizeTelegramMessage(message,{source={}}={}){
  const text=String(message?.text ?? message?.message ?? "").trim();
  const channelId=String(message?.channel_id ?? message?.chat_id ?? source.channel_id ?? "").trim();
  const messageId=String(message?.message_id ?? message?.id ?? "").trim();
  const retrievedAt=message?.retrieved_at || new Date().toISOString();
  const publishedAt=message?.date || message?.published_at || null;
  const sourceClass=classifyTelegramSource(source);
  return {
    source_id:String(source.source_id || "").trim() || null,
    channel_id:channelId || null,
    channel_name:String(source.channel_name || message?.channel_name || "").trim() || null,
    message_id:messageId || null,
    text,
    content_hash:sha256(text),
    canonical_url:message?.url || message?.canonical_url || null,
    published_at:publishedAt,
    retrieved_at:retrievedAt,
    verification_class:sourceClass,
    identity_verified:Boolean(source.identity_verified),
    authority_level:source.authority_level || "EARLY_SIGNAL"
  };
}

export function telegramCanConfirm(message){
  return message?.verification_class===VERIFIED;
}
