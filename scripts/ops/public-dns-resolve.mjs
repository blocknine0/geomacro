#!/usr/bin/env node
import { execFileSync } from "node:child_process";

const RESOLVERS = [
  { name: "cloudflare", host: "cloudflare-dns.com", ip: "1.1.1.1" },
  { name: "google", host: "dns.google", ip: "8.8.8.8" },
];

function queryResolver(resolver, hostname, type) {
  const url = `https://${resolver.host}/resolve?name=${encodeURIComponent(hostname)}&type=${encodeURIComponent(type)}`;
  const output = execFileSync("curl", [
    "--silent", "--show-error",
    "--connect-timeout", "5", "--max-time", "8",
    "--resolve", `${resolver.host}:443:${resolver.ip}`,
    "-H", "accept: application/dns-json",
    url,
  ], { encoding: "utf8", maxBuffer: 1024 * 1024 });
  return JSON.parse(output);
}

function extract(body, type) {
  return (Array.isArray(body?.Answer) ? body.Answer : [])
    .filter((answer) => Number(answer.type) === type)
    .map((answer) => String(answer.data || '').trim())
    .filter(Boolean);
}

export function resolvePublicHost(hostname) {
  const ipv4 = new Set();
  const ipv6 = new Set();
  const resolvers = [];
  for (const resolver of RESOLVERS) {
    try {
      const a = queryResolver(resolver, hostname, "A");
      const aaaa = queryResolver(resolver, hostname, "AAAA");
      const v4 = extract(a, 1);
      const v6 = extract(aaaa, 28);
      v4.forEach((ip) => ipv4.add(ip));
      v6.forEach((ip) => ipv6.add(ip));
      resolvers.push({ resolver: resolver.name, ok: true, ipv4: v4, ipv6: v6 });
    } catch (error) {
      resolvers.push({ resolver: resolver.name, ok: false, error: String(error?.message ?? error).slice(0, 500) });
    }
  }
  const result = { hostname, ipv4: [...ipv4], ipv6: [...ipv6], resolvers };
  if (result.ipv4.length === 0 && result.ipv6.length === 0) {
    throw new Error(`Public DNS could not resolve ${hostname}: ${JSON.stringify(resolvers)}`);
  }
  return result;
}

const hostname = String(process.argv[2] || '').trim();
if (hostname) console.log(JSON.stringify(resolvePublicHost(hostname), null, 2));
