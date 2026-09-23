const optional = [
  ["UN_COMTRADE_API_KEY","UN Comtrade free API key"],
  ["TELEGRAM_API_ID","Telegram API application id"],
  ["TELEGRAM_API_HASH","Telegram API application hash"],
  ["TELEGRAM_BOT_TOKEN","Telegram Bot API token (only if Bot API is used)"],
  ["IMF_API_TOKEN","IMF credential if the selected endpoint requires it"]
];

const present = optional.filter(([name])=>String(process.env[name]??"").trim()).map(([name])=>name);
const missing = optional.filter(([name])=>!String(process.env[name]??"").trim()).map(([name])=>name);

console.log(JSON.stringify({
  ok:true,
  present,
  missing_optional_until_adapter_ready:missing,
  policy:"No credential is required to begin source adapter development; secrets are only required for live probes of the corresponding adapter."
},null,2));
