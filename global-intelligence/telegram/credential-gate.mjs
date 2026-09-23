export function telegramCredentialStatus(env=process.env){
 const hasApi=Boolean(env.TELEGRAM_API_ID&&env.TELEGRAM_API_HASH);
 const hasBot=Boolean(env.TELEGRAM_BOT_TOKEN);
 return {mtproto_ready:hasApi,bot_api_ready:hasBot,ready:hasApi||hasBot,required_for_public_channel_mtproto:["TELEGRAM_API_ID","TELEGRAM_API_HASH"]};
}
if(import.meta.url===`file://${process.argv[1]}`) console.log(JSON.stringify(telegramCredentialStatus(),null,2));
