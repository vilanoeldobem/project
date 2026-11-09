/**
 * verify.mjs — opens the website in a real Chrome (playwright-core + system Chrome) at desktop and
 * phone sizes, checks that every "Entrar na Vila" link points to the game, saves full-page
 * screenshots to verify-output/ and fails on console/page errors.
 *
 * Usage: node scripts/verify.mjs [url]   (default http://localhost:4173, i.e. `pnpm preview`)
 */
import { mkdirSync } from "node:fs";

import { chromium } from "playwright-core";

const url = process.argv[2] ?? "http://localhost:4173";
const out = new URL("../verify-output/", import.meta.url).pathname;
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: "chrome" });
const errors = [];
for (const [name, viewport] of [["desktop", { width: 1440, height: 900 }], ["mobile", { width: 390, height: 844 }]]) {
  const page = await browser.newPage({ viewport });
  page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`${name}: ${m.text()}`));
  await page.goto(url, { waitUntil: "networkidle" });
  const hrefs = await page.getByRole("link", { name: "Entrar na Vila" }).evaluateAll((els) => els.map((e) => e.getAttribute("href")));
  if (hrefs.length === 0 || hrefs.some((h) => h !== "https://app.vilanoeldobem.com.br")) errors.push(`${name}: bad game links ${hrefs}`);
  await page.screenshot({ path: `${out}${name}.png`, fullPage: true });
  await page.close();
}
await browser.close();
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`ok — screenshots in ${out}`);
