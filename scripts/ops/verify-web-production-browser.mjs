import { createRequire } from "node:module";

const packageRoot = process.env.PLAYWRIGHT_PACKAGE_ROOT;
if (!packageRoot) throw Error("WEB_STAGING_PLAYWRIGHT_PACKAGE_REQUIRED");
const require = createRequire(new URL("package.json", `file://${packageRoot.replaceAll("\\", "/")}/`));
const { chromium } = require("playwright");
const base = process.env.GEOMACRO_WEB_STAGING_URL ??
  "https://geomacro-web-production-staging.daspallab202391.workers.dev";

const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of [{ name: "desktop", width: 1440, height: 900 },
    { name: "mobile", width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
    for (const path of ["/", "/intelligence", "/ask-geomacro", "/data-api", "/institutional", "/contact", "/pricing"]) {
      const response = await page.goto(new URL(path, base).href, {
        waitUntil: "domcontentloaded", timeout: 30_000,
      });
      if (response?.status() !== 200 || !await page.locator("h1").count() ||
          !await page.locator('meta[name="viewport"]').count()) {
        throw Error(`WEB_STAGING_${viewport.name.toUpperCase()}_RENDER_FAILED:${path}`);
      }
      const dimensions = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        document: document.documentElement.scrollWidth,
        brokenImages: [...document.images].filter(image => !image.complete || image.naturalWidth === 0).length,
      }));
      if (dimensions.document > dimensions.viewport + 1 || dimensions.brokenImages > 0) {
        throw Error(`WEB_STAGING_${viewport.name.toUpperCase()}_LAYOUT_FAILED:${path}`);
      }
    }
    await page.close();
  }
} finally {
  await browser.close();
}

console.log(JSON.stringify({
  schema: "geomacro.web-production-browser-acceptance.v1",
  desktop_routes_rendered: 7,
  mobile_routes_rendered: 7,
  horizontal_overflow: false,
  broken_images: 0,
}));
