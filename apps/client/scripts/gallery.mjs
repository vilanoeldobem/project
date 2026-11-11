/**
 * gallery.mjs — screenshots the dev model gallery (IMPL-0010) for art review, one PNG per category,
 * and prints render cost. Fails on console/page errors.
 *
 * Usage: node scripts/gallery.mjs [url] [category…]   (default http://localhost:8799, all categories)
 */
import { mkdirSync } from "node:fs";

import { chromium } from "playwright-core";

const [url = "http://localhost:8799", ...cats] = process.argv.slice(2);
const categories = cats.length ? cats : ["props", "houses", "characters", "animals", "cosmetics"];
const out = new URL("../verify-output/", import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const errors = [];
for (const cat of categories) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => errors.push(`${cat}: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`${cat}: ${m.text()}`));
  const sep = url.includes("?") ? "&" : "?";
  await page.goto(`${url}${sep}gallery&cat=${cat}`, { waitUntil: "load" });
  await page.waitForSelector("canvas", { timeout: 15000 });
  await page.waitForTimeout(5000);
  await page.screenshot({ path: `${out}gallery-${cat}.png` });
  console.log(cat, "·", await page.locator(".gallery__perf").textContent());
  await page.close();
}
await browser.close();
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
