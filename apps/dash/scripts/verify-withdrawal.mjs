/** Existing dashboard compatibility after the API's local withdrawal smoke; no remote services or auth-flow claim. */
import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const dash = new URL(process.argv[2] ?? "http://localhost:8797");
const api = new URL(process.argv[3] ?? "http://127.0.0.1:8793");
for (const url of [dash, api]) {
  assert.equal(url.protocol, "http:");
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname), "Local simulators only");
}
const ngo = "e0000000-0000-4000-8000-000000000001";
const errors = [];
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
  env: { ...process.env, TMPDIR: "/tmp" }, args: ["--renderer-process-limit=2"],
});
try {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport });
    // A local-only transport bridge adds the synthetic admin session. No real credential or external API is used.
    // Both production and local dashboard bundles are supported; this validates rendering, not login cookies.
    await context.route("**/*", async (route) => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin === dash.origin) return route.continue();
      if (!["https://api.vilanoeldobem.com.br", "http://localhost:8787"].includes(url.origin)) {
        errors.push(`Unexpected origin: ${url.origin}`);
        return route.abort();
      }
      assert.equal(request.method(), "GET", "This browser check must never mutate data");
      const response = await fetch(new URL(url.pathname + url.search, api), {
        headers: { Origin: dash.origin, Cookie: "__Host-vila_session=local-withdrawal-admin" },
      });
      await route.fulfill({ status: response.status, body: Buffer.from(await response.arrayBuffer()), headers: {
        "Content-Type": "application/json", "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": dash.origin, "Access-Control-Allow-Credentials": "true",
      } });
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto(dash.href, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Retirada da Vila", exact: true }).click();
    const application = page.getByRole("link", { name: /Synthetic withdrawal NGO/ });
    await application.waitFor();
    assert.match(await application.innerText(), /Retirada da Vila/);
    await application.click();
    await page.getByRole("heading", { name: "Synthetic withdrawal NGO", exact: true }).waitFor();
    assert.ok(page.url().endsWith(ngo));
    assert.ok(await page.getByText("Retirada da Vila", { exact: true }).count());
    assert.equal(await page.getByRole("button", { name: /Aprovar e publicar|Iniciar análise/ }).count(), 0);
    await page.getByRole("link", { name: "ONGs e terrenos", exact: true }).click();
    // Mobile cells include their CSS data-label in the accessible name.
    const row = page.getByRole("row").filter({ has: page.getByRole("cell", { name: /^(?:Terreno )?Terreno 1$/ }) });
    await row.waitFor();
    assert.match(await row.innerText(), /Disponível/);
    assert.ok(!(await row.innerText()).includes("Synthetic withdrawal NGO"));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log("PASS: desktop/mobile dashboard withdrawal status/filter, read-only detail and freed-lot occupancy");
} finally {
  await browser.close();
}
