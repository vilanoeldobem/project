/**
 * verify.mjs — opens the village in a real Chrome (playwright-core + system Chrome), walks the
 * basic flow and saves screenshots to verify-output/. Fails on any console or page error.
 *
 * Usage: node scripts/verify.mjs [url]   (default http://localhost:8787, e.g. `pnpm dev:worker`)
 */
import { mkdirSync } from "node:fs";

import { chromium } from "playwright-core";

const url = process.argv[2] ?? "http://localhost:8787";
const out = new URL("../verify-output/", import.meta.url).pathname;
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const errors = [];
for (const [name, viewport] of [["desktop", { width: 1440, height: 900 }], ["mobile", { width: 390, height: 844 }]]) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`${name}: ${m.text()}`));
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForSelector("canvas", { timeout: 15000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}${name}-1-welcome.png` });
  await page.getByRole("button", { name: "Entrar na Vila" }).click();
  // Walk towards the tree (W key) so the contextual action shows up.
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(500);
  await page.keyboard.up("KeyW");
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}${name}-2-praca.png` });
  await page.getByRole("button", { name: /Indicadores/ }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}${name}-3-indicadores.png` });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /Jogar/ }).first().click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}${name}-4-memoria.png` });
  await page.close();
}
await browser.close();
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`ok — screenshots in ${out}`);
