import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const browser = readFileSync("scripts/ops/verify-website-real-browser.mjs", "utf8");
const pricing = readFileSync("src/routes/pricing.tsx", "utf8");
const alias = readFileSync("src/routes/data-api.tsx", "utf8");
describe("unified Store & API browser acceptance", () => {
  it("expects the old API route to redirect to the actual canonical storefront", () => {
    expect(alias).toContain('redirect({ to: "/pricing", replace: true })');
    expect(browser).toContain('{path:"/data-api",canonical:"/pricing",title:/store.*api/i}');
    expect(browser).toContain("state.path===item.canonical");
    expect(browser).toContain('response?.status()===200,"BROWSER_PUBLIC_PAGE_HTTP_UNAVAILABLE"');
    expect(pricing).toContain('const TITLE = "Store & API | Geomacro"');
  });
  it("still checks desktop, mobile and public routes instead of bypassing browser QA", () => {
    expect(browser).toContain("BROWSER_MOBILE_MENU_TRIGGER_HIDDEN");
    expect(browser).toContain("BROWSER_DESKTOP_NAV_LINK_HIDDEN");
    expect(browser).toContain("BROWSER_PUBLIC_PAGE_JS_EXCEPTION");
    expect(browser).toContain("BROWSER_BUILD_SOURCE_PARITY_UNVERIFIED");
  });
});
