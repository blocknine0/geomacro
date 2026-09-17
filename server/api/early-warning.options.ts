import {
  defineEventHandler,
  setResponseHeaders,
  setResponseStatus,
} from "h3";

export default defineEventHandler((event) => {
  setResponseStatus(event, 204);
  setResponseHeaders(event, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "public, max-age=15, s-maxage=30, stale-while-revalidate=60",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow",
  });
  return null;
});
