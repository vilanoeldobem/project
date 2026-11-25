// Build with pnpm --filter @vila/dash build:local, then run this file with Node.
// Only the compiled dashboard is served. All API responses are synthetic and all other network traffic is blocked.
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { preview } from "vite";

const server = await preview({
  root: fileURLToPath(new URL("../", import.meta.url)), configFile: false,
  preview: { host: "127.0.0.1", port: 0, open: false },
});
const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
const api = "http://localhost:8787";
const overview = {
  settings: { primaryNgoName: null, primaryNgoCnpj: null, ngoPercentBps: 9800, fixedFeeCents: 80, configured: false },
  ngos: [], recentDonations: [], recentRedirects: [],
};
const row = (scope, pix_count, pix_gross_cents, proof_count = 0, proof_amount_cents = 0) => ({
  scope, ngo_id: scope === "ngo" ? "test-ngo" : null, ngo_name: scope === "ngo" ? "ONG de teste" : null,
  pix_count, pix_gross_cents, proof_count, proof_amount_cents,
});
let browser;
try {
  browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : { channel: "chrome" });
  const page = await browser.newPage({ serviceWorkers: "block" });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  let totals;
  await page.route("**/*", route => {
    const { pathname, origin: target } = new URL(route.request().url());
    if (target === origin) return route.continue();
    if (target !== api || route.request().method() !== "GET") return route.abort();
    let json;
    if (pathname === "/config") json = { accounts: true, donations: true };
    else if (pathname === "/me") json = { user: { id: "test-admin", role: "admin", nickname: "Teste" } };
    else if (pathname === "/admin/donations/overview") json = { ...overview, paidByDestination: totals };
    else return route.abort();
    return route.fulfill({ json, headers: { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true" } });
  });
  await page.goto(`${origin}/#/pending`);
  await page.getByText("Totais por destino indisponíveis.").waitFor();
  assert.equal(await page.getByRole("table", { name: "Pix e comprovantes por destino" }).count(), 0);
  totals = [row("global", 0, 0), row("total", 0, 0)];
  await page.reload();
  const table = page.getByRole("table", { name: "Pix e comprovantes por destino" });
  const cells = async name => {
    const bodyRow = table.getByRole("row", { name: new RegExp(name) });
    await bodyRow.waitFor();
    return (await bodyRow.getByRole("cell").allTextContents()).map(text => text.replace(/\s/g, " "));
  };
  assert.deepEqual(await cells("Total geral"), ["Total geral", "0", "R$ 0,00", "0", "R$ 0,00"]);
  totals = [row("global", 1, 1000), row("ngo", 1, 725, 1, 500), row("total", 2, 1725, 1, 500)];
  await page.reload();
  assert.deepEqual(await cells("ONG de teste"), ["ONG de teste", "1", "R$ 7,25", "1", "R$ 5,00"]);
  assert.deepEqual(await cells("Total geral"), ["Total geral", "2", "R$ 17,25", "1", "R$ 5,00"]);
  assert.deepEqual(errors, []);
  console.log("PASS: legacy overview, empty ledger and named destinations with separate Pix and manual proof.");
} finally {
  await browser?.close();
  await server.close();
}
