/**
 * verify-shop.mjs — the P08 provador end to end in a real Chrome, at 1440×900 and 390×844. For each of the
 * four shops it enters the panel from the avatar at the door, lists every category (10 items, 8 free and 2
 * paid), previews and equips one item, checks the inventory count, and for the Ateliê it also checks a paid
 * card (only the honest "not available" note) and a locked card (requirement, no equip). It proves that a
 * preview does not change the look, an equipped item does, the look persists in `vila.look.v2` across a reload,
 * that the dress/blouse rule holds, and that the phone layout does not scroll sideways.
 *
 * Local only. The page is seeded with the `explore-gifts` mission completed (30 of 80 free items owned) so the
 * flow is deterministic; the mission itself is covered by `verify.mjs` and the shared tests.
 *
 * Usage: node scripts/verify-shop.mjs [game=http://localhost:8799]
 */
import { mkdirSync } from "node:fs";

import { chromium } from "playwright-core";

import { arrive } from "./arrive.mjs";

const game = (process.argv[2] ?? "http://localhost:8799").replace(/\/$/, "");
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(game)) {
  console.error("local only");
  process.exit(1);
}
const out = new URL("../verify-output/", import.meta.url).pathname;
mkdirSync(out, { recursive: true });

const SEED = {
  "vila.environment.v1": JSON.stringify({ quality: "low", multiplayer: false }),
  "vila.progress.v2": JSON.stringify({ xp: 30, counters: {}, completed: { "explore-gifts": true }, seen: {} }),
};

/** The four shops: door point, panel title, categories and the free items this check equips. */
const SHOPS = [
  {
    id: "shop-01",
    name: "Ateliê de Enfeites",
    door: [25.5, -5],
    categories: ["Capacete", "Costas", "Rosto"],
    equips: [
      { category: "Capacete", id: "helmet-beanie", name: "Gorro de tricô", slot: "helmet" },
      { category: "Capacete", id: "helmet-elf", name: "Gorro de duende", slot: "helmet" },
    ],
    paid: { category: "Capacete", id: "helmet-crown", name: "Coroa dourada" },
    locked: { category: "Capacete", id: "helmet-holly", name: "Coroa de azevinho" },
  },
  {
    id: "shop-02",
    name: "Oficina de Brinquedos",
    door: [5, 25.5],
    categories: ["Mão esquerda", "Mão direita"],
    equips: [{ category: "Mão esquerda", id: "hand-left-candy", name: "Bengala doce", slot: "handLeft" }],
  },
  {
    id: "shop-03",
    name: "Alfaiataria de Inverno",
    door: [-25.5, 5],
    categories: ["Blusa", "Calça", "Vestido", "Sapato"],
    equips: [
      { category: "Blusa", id: "blouse-stripes", name: "Suéter listrado", slot: "blouse" },
      { category: "Vestido", id: "dress-red", name: "Vestido vermelho", slot: "dress" },
      { category: "Blusa", id: "blouse-stripes", name: "Suéter listrado", slot: "blouse" },
    ],
  },
  {
    id: "shop-04",
    name: "Empório da Lareira",
    door: [-5, -25.5],
    categories: ["Especial"],
    equips: [{ category: "Especial", id: "special-halo", name: "Auréola", slot: "special" }],
  },
];

const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const errors = [];
const analyticsNoise = (text) => /googletagmanager|google-analytics|doubleclick|google\.com\/g\/collect|google\.com\.br\/ads/.test(text);

const listen = (page, name) => {
  page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && !analyticsNoise(m.text()) && errors.push(`${name}: ${m.text()}`));
};
const ready = async (page) => {
  await page.waitForSelector("canvas", { timeout: 20000 });
  await page.waitForTimeout(1200);
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

for (const [name, viewport] of [
  ["desktop", { width: 1440, height: 900 }],
  ["mobile", { width: 390, height: 844 }],
]) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  listen(page, name);
  await page.addInitScript((seed) => {
    for (const [key, value] of Object.entries(seed)) localStorage.setItem(key, value);
  }, SEED);
  await page.goto(`${game}?envTime=12:00&envWeather=clear`, { waitUntil: "load" });
  await ready(page);
  await arrive(page, errors, name);

  const look = () => page.evaluate(() => window.__vila.look());

  const openShop = async (shop) => {
    await page.evaluate(([x, z]) => window.__vila.extra.teleport(x, z), shop.door);
    const action = page.getByRole("button", { name: /Ver loja/ });
    const shown = await action.waitFor({ timeout: 20000 }).then(() => true, () => false);
    if (!shown) {
      errors.push(`${name}/${shop.id}: no "Ver loja" action at ${JSON.stringify(shop.door)}`);
      return null;
    }
    await action.click();
    const dialog = page.getByRole("dialog", { name: shop.name, exact: true });
    const opened = await dialog.waitFor({ timeout: 10000 }).then(() => true, () => false);
    if (!opened) {
      errors.push(`${name}/${shop.id}: the shop panel "${shop.name}" did not open`);
      return null;
    }
    return dialog;
  };

  const wardrobe = (dialog) => dialog.locator(".wardrobe");

  const checkCategory = async (dialog, label) => {
    await dialog.getByRole("button", { name: label, exact: true }).click();
    await page.waitForTimeout(120);
    const cards = await dialog.locator("[data-item-id]").count();
    const paid = await dialog.locator('[data-sale="paid"]').count();
    const free = await dialog.locator('[data-sale="free"]').count();
    if (cards !== 10) errors.push(`${name}: "${label}" shows ${cards} items, not 10`);
    if (paid !== 2) errors.push(`${name}: "${label}" shows ${paid} paid items, not 2`);
    if (free !== 8) errors.push(`${name}: "${label}" shows ${free} free items, not 8`);
  };

  const equip = async (dialog, test) => {
    await dialog.getByRole("button", { name: test.category, exact: true }).click();
    await page.waitForTimeout(120);
    const card = dialog.locator(`[data-item-id="${test.id}"]`);
    if (!(await card.count())) {
      errors.push(`${name}: item ${test.id} is not in ${test.category}`);
      return null;
    }
    const before = await look();
    await card.getByRole("button", { name: `Provar ${test.name}`, exact: true }).click();
    await page.waitForTimeout(100);
    if ((await wardrobe(dialog).getAttribute("data-preview")) !== test.id) errors.push(`${name}: preview of ${test.id} is not shown`);
    if (!same(await look(), before)) errors.push(`${name}: previewing ${test.id} changed the equipped look`);
    const button = card.getByRole("button", { name: "Equipar", exact: true });
    if (await button.isDisabled().catch(() => true)) {
      errors.push(`${name}: ${test.id} (${test.name}) is not equippable`);
      return null;
    }
    await button.click();
    await page.waitForTimeout(120);
    const after = await look();
    if (after[test.slot] !== test.id) errors.push(`${name}: ${test.slot} is ${after[test.slot]}, not ${test.id}`);
    if ((await card.getAttribute("data-state")) !== "equipped") errors.push(`${name}: ${test.id} is not marked "Em uso"`);
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("vila.look.v2") ?? "null"));
    if (!stored || stored[test.slot] !== test.id) errors.push(`${name}: vila.look.v2 does not hold ${test.id}`);
    return after;
  };

  for (const shop of SHOPS) {
    const dialog = await openShop(shop);
    if (!dialog) continue;
    if ((await wardrobe(dialog).getAttribute("data-owned")) !== "30") errors.push(`${name}/${shop.id}: inventory owned is not 30`);
    if ((await wardrobe(dialog).getAttribute("data-free")) !== "80") errors.push(`${name}/${shop.id}: free catalogue is not 80`);
    if (!(await dialog.getByText("No inventário: 30 de 80 visuais gratuitos.").count())) errors.push(`${name}/${shop.id}: inventory line is missing`);
    for (const label of shop.categories) await checkCategory(dialog, label);

    const looks = [];
    for (const test of shop.equips) looks.push(await equip(dialog, test));
    if (shop.id === "shop-03") {
      const dress = looks[1];
      if (!dress || dress.dress !== "dress-red" || dress.blouse !== "blouse-plain" || dress.pants !== "pants-blue") {
        errors.push(`${name}: dress did not reset blouse/pants (${JSON.stringify(dress)})`);
      }
      // The last equip was the blouse again, so the dress must be off now.
      const after = looks[2];
      if (!after || after.dress !== "dress-none" || after.blouse !== "blouse-stripes") errors.push(`${name}: blouse did not take the dress off (${JSON.stringify(after)})`);
    }

    if (shop.paid) {
      await dialog.getByRole("button", { name: shop.paid.category, exact: true }).click();
      await page.waitForTimeout(120);
      const card = dialog.locator(`[data-item-id="${shop.paid.id}"]`);
      const before = await look();
      await card.getByRole("button", { name: "Ver compra", exact: true }).click();
      await page.waitForTimeout(100);
      const note = dialog.locator("[data-paid-note]");
      if (!(await note.count())) errors.push(`${name}: paid note is missing`);
      if (!(await note.textContent())?.includes("A compra de visuais não está disponível.")) errors.push(`${name}: paid note text differs`);
      if (!same(await look(), before)) errors.push(`${name}: "Ver compra" changed the look`);
      const text = (await dialog.textContent()) ?? "";
      if (/R\$|\bpreço\b|\bmoedas?\b|\bcarrinho\b/i.test(text)) errors.push(`${name}: the shop shows a price or currency`);
    }

    if (shop.locked) {
      await dialog.getByRole("button", { name: shop.locked.category, exact: true }).click();
      await page.waitForTimeout(120);
      const card = dialog.locator(`[data-item-id="${shop.locked.id}"]`);
      if ((await card.getAttribute("data-state")) !== "locked") errors.push(`${name}: ${shop.locked.id} is not locked`);
      if (!((await card.textContent()) ?? "").includes("Conclua:")) errors.push(`${name}: ${shop.locked.id} does not say how to unlock`);
      if (!(await card.getByRole("button", { name: "Equipar", exact: true }).isDisabled())) errors.push(`${name}: ${shop.locked.id} can be equipped while locked`);
      const before = await look();
      await card.getByRole("button", { name: `Provar ${shop.locked.name}`, exact: true }).click();
      await page.waitForTimeout(100);
      if (!(await dialog.getByText("Prévia: o item não está no seu inventário; nada é equipado.").count())) errors.push(`${name}: locked preview note is missing`);
      if (!same(await look(), before)) errors.push(`${name}: previewing a locked item changed the look`);
    }

    const small = await dialog.evaluate((panel) =>
      [...panel.querySelectorAll("button")]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && (r.width < 44 || r.height < 44);
        })
        .map((el) => (el.textContent ?? "").trim().slice(0, 24))
    );
    if (small.length) errors.push(`${name}/${shop.id}: controls under 44 px: ${small.join(" | ")}`);
    if ((await page.evaluate(() => document.documentElement.scrollWidth)) > viewport.width) errors.push(`${name}/${shop.id}: the page scrolls sideways`);
    if (name === "mobile") {
      const overflowX = await dialog.locator(".category-tabs").evaluate((el) => getComputedStyle(el).overflowX);
      if (overflowX !== "auto" && overflowX !== "scroll") errors.push(`${name}/${shop.id}: the category row is not a horizontal scroller (${overflowX})`);
    }

    await page.screenshot({ path: `${out}shop-${shop.id}-${name}.png` });
    await page.keyboard.press("Escape");
    if (await page.getByRole("dialog").count()) errors.push(`${name}/${shop.id}: Escape did not close the panel`);
    await page.waitForTimeout(300);
  }

  // The equipped avatar at the shop door, closer: a visible proof beside the panel screenshots.
  await page.mouse.move(viewport.width / 2, viewport.height / 2);
  await page.mouse.wheel(0, -600);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}shop-look-${name}.png` });

  if (name === "desktop") {
    const before = await look();
    await page.reload({ waitUntil: "load" });
    await ready(page);
    await arrive(page, errors, `${name}-reload`);
    const after = await look();
    if (!same(after, before)) errors.push(`${name}: the look did not survive a reload (${JSON.stringify(after)})`);
    const dialog = await openShop(SHOPS[0]);
    if (dialog) {
      await dialog.getByRole("button", { name: "Capacete", exact: true }).click();
      await page.waitForTimeout(120);
      const card = dialog.locator('[data-item-id="helmet-elf"]');
      if ((await card.getAttribute("data-state")) !== "equipped") errors.push(`${name}: the reloaded look is not "Em uso"`);
      await page.keyboard.press("Escape");
    }
  }

  await page.close();
}

await browser.close();
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`ok — shop screenshots in ${out}`);
