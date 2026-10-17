import {createServerFn} from "@tanstack/react-start";
import type {WebsiteDerivedNewsResult} from "./website-derived-news-reader.server";
export type {WebsiteDerivedNewsResult} from "./website-derived-news-reader.server";
/** Read a recent derived-only D1 timeline with server/browser parity. */
export const getWebsiteDerivedNews = createServerFn({method:"GET"})
 .handler(async():Promise<WebsiteDerivedNewsResult>=>{
  const {setResponseHeaders}=await import("@tanstack/react-start/server");
  setResponseHeaders(new Headers({"Cache-Control":"no-store","CDN-Cache-Control":"no-store"}));
  const {readWebsiteDerivedNews}=await import("./website-derived-news-reader.server");
  return readWebsiteDerivedNews();
 });
