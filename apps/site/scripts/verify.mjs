/**
 * verify.mjs — full-site verification for the public website in a real Chrome
 * (playwright-core + system Chrome).
 *
 * Contract: every route (`/`, `/404.html`) is loaded at the eight required widths in both
 * colour themes, with no console error, no failed request, no horizontal overflow, every
 * "Entrar na Vila" pointing at the game, every image loaded with explicit dimensions, and every
 * interactive control at least 44×44 CSS px with a visible focus ring. Interaction, comfort,
 * zoom, preference and stress checks run once on top of the matrix. Screenshots go to
 * verify-output/.
 *
 * Usage: node scripts/verify.mjs [url]   (default http://localhost:4173, i.e. `pnpm preview`)
 */
import { mkdirSync } from "node:fs";

import { chromium } from "playwright-core";

const base = (process.argv[2] ?? "http://localhost:4173").replace(/\/$/, "");
const gameUrl = "https://play.vilanoeldobem.com.br";
const out = new URL("../verify-output/", import.meta.url).pathname;
mkdirSync(out, { recursive: true });

const VIEWPORTS = [
  [320, 640],
  [375, 667],
  [414, 896],
  [768, 1024],
  [1024, 768],
  [1280, 800],
  [1440, 900],
  [1920, 1080],
];
const ROUTES = [
  { path: "/", name: "home" },
  { path: "/404.html", name: "not-found" },
];

const failures = [];
const passes = { loads: 0, assertions: 0 };
const check = (condition, message) => {
  passes.assertions += 1;
  if (!condition) failures.push(message);
};

const browser = await chromium.launch({ channel: "chrome" });

/** Console errors, page errors, failed requests and 4xx/5xx responses for one page. */
function watch(page, label) {
  const problems = [];
  page.on("pageerror", (error) => problems.push(`${label}: pageerror ${error.message}`));
  page.on("console", (message) => message.type() === "error" && problems.push(`${label}: console ${message.text()}`));
  page.on("requestfailed", (request) => problems.push(`${label}: requestfailed ${request.url()}`));
  page.on("response", (response) => {
    if (response.status() >= 400) problems.push(`${label}: HTTP ${response.status()} ${response.url()}`);
  });
  return problems;
}

/** Assertions that must hold on every route, viewport and theme. */
async function inspectRoute(page, label, mobile) {
  const facts = await page.evaluate(() => {
    const interactive = [...document.querySelectorAll("a, button")].filter((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < rect.bottom && style.visibility !== "hidden";
    });
    return {
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      gameLinks: [...document.querySelectorAll("a")].filter((a) => /Entrar na Vila/.test(a.textContent ?? "")).map((a) => a.getAttribute("href")),
      anchors: [...document.querySelectorAll('a[href^="#"]')].map((a) => (a.getAttribute("href") ?? "").slice(1)).filter((id) => id.length > 0 && !document.getElementById(id)),
      images: [...document.images].map((image) => ({
        src: image.currentSrc.split("/").pop(),
        ok: image.complete && image.naturalWidth > 0,
        width: image.getAttribute("width"),
        height: image.getAttribute("height"),
      })),
      small: interactive
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            label: `${element.tagName.toLowerCase()}:${(element.getAttribute("aria-label") ?? element.textContent ?? "").trim().slice(0, 28)}`,
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          };
        })
        .filter((entry) => entry.width < 44 || entry.height < 44),
      theme: document.documentElement.dataset.theme ?? "",
    };
  });

  check(facts.scrollWidth <= facts.innerWidth, `${label}: horizontal overflow ${facts.scrollWidth} > ${facts.innerWidth}`);
  check(facts.gameLinks.length > 0, `${label}: no "Entrar na Vila" link`);
  check(
    facts.gameLinks.every((href) => href === gameUrl),
    `${label}: bad game links ${JSON.stringify(facts.gameLinks)}`,
  );
  check(facts.anchors.length === 0, `${label}: dead anchors ${JSON.stringify(facts.anchors)}`);
  check(
    facts.images.every((image) => image.ok && image.width && image.height),
    `${label}: broken or unsized images ${JSON.stringify(facts.images)}`,
  );
  if (mobile) check(facts.small.length === 0, `${label}: targets under 44px ${JSON.stringify(facts.small.slice(0, 5))}`);
  check(facts.theme === "" || facts.theme === "light" || facts.theme === "dark", `${label}: bad data-theme ${facts.theme}`);
  return facts;
}

/* ------------------------------------------------------------------ matrix */
for (const route of ROUTES) {
  for (const [width, height] of VIEWPORTS) {
    for (const scheme of ["light", "dark"]) {
      const label = `${route.name} ${width}px ${scheme}`;
      const context = await browser.newContext({
        viewport: { width, height },
        colorScheme: scheme,
        hasTouch: width <= 414,
        isMobile: false,
        reducedMotion: "no-preference",
      });
      const page = await context.newPage();
      const problems = watch(page, label);
      await page.goto(`${base}${route.path}`, { waitUntil: "networkidle" });
      passes.loads += 1;
      const facts = await inspectRoute(page, label, width <= 414);
      check(problems.length === 0, problems.join(" | "));

      const shots = {
        "home:1440:light": "desktop.png",
        "home:1440:dark": "desktop-dark.png",
        "home:375:light": "mobile.png",
        "home:375:dark": "mobile-dark.png",
        "not-found:1440:light": "404-desktop.png",
        "not-found:375:light": "404-mobile.png",
        "not-found:375:dark": "404-mobile-dark.png",
      };
      const shot = shots[`${route.name}:${width}:${scheme}`];
      if (shot) await page.screenshot({ path: `${out}${shot}`, fullPage: true });

      if (facts.theme !== "" && facts.theme !== scheme) {
        failures.push(`${label}: saved theme leaked into a fresh context (${facts.theme})`);
      }
      await page.close();
      await context.close();
    }
  }
}

/* --------------------------------------------------------------- behaviour */
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: "light" });
  const page = await context.newPage();
  const problems = watch(page, "behaviour");
  await page.goto(`${base}/`, { waitUntil: "networkidle" });

  // Focus ring on the first keyboard stop.
  await page.keyboard.press("Tab");
  const focus = await page.evaluate(() => {
    const element = document.activeElement;
    if (!element) return null;
    const style = getComputedStyle(element);
    return { tag: element.tagName, outlineWidth: style.outlineWidth, outlineStyle: style.outlineStyle };
  });
  check(!!focus && focus.outlineStyle !== "none" && parseFloat(focus.outlineWidth) >= 2, `focus: no visible ring ${JSON.stringify(focus)}`);

  // Diorama tabs: pointer + keyboard, with image and caption following the selection.
  const firstSrc = await page.locator(".diorama__img").getAttribute("src");
  await page.getByRole("tab", { name: "Noite de neve" }).click();
  const nightSrc = await page.locator(".diorama__img").getAttribute("src");
  const firstCaption = "Praça nevada ao entardecer";
  const nightCaption = await page.locator(".diorama__caption").innerText();
  check(nightSrc?.includes("praca-noite") && nightSrc !== firstSrc, `tabs: image did not switch (${nightSrc})`);
  check(nightCaption !== firstCaption && nightCaption.length > 0, `tabs: caption did not switch (${nightCaption})`);
  await page.getByRole("tab", { name: "Missões e visual" }).click();
  check((await page.locator(".diorama__img").getAttribute("src"))?.includes("praca-missoes"), "tabs: third scene missing");
  await page.getByRole("tab", { name: "Praça nevada" }).focus();
  await page.keyboard.press("ArrowRight");
  check(
    (await page.getByRole("tab", { name: "Noite de neve" }).getAttribute("aria-selected")) === "true",
    "tabs: ArrowRight did not move the selection",
  );
  await page.keyboard.press("End");
  check(
    (await page.getByRole("tab", { name: "Missões e visual" }).getAttribute("aria-selected")) === "true",
    "tabs: End did not move the selection",
  );

  // Theme: toggles, persists across reload and rewrites the browser chrome colour.
  const themeChip = page.locator(".top__theme");
  const before = await page.evaluate(() => document.documentElement.dataset.theme);
  await themeChip.click();
  const after = await page.evaluate(() => document.documentElement.dataset.theme);
  const stored = await page.evaluate(() => localStorage.getItem("vila.site.theme.v1"));
  const meta = await page.evaluate(() => document.querySelector('meta[name="theme-color"]:not([media])')?.getAttribute("content"));
  check(before !== after && (after === "dark" || after === "light"), `theme: toggle failed ${before} → ${after}`);
  check(stored === after, `theme: not persisted (${stored})`);
  check(!!meta, "theme: theme-color meta missing");
  await page.reload({ waitUntil: "networkidle" });
  check((await page.evaluate(() => document.documentElement.dataset.theme)) === after, "theme: did not survive reload");

  // Snow comfort toggle keeps its state.
  const snowChip = page.locator(".top__snow");
  const pressedBefore = await snowChip.getAttribute("aria-pressed");
  await snowChip.click();
  const pressedAfter = await snowChip.getAttribute("aria-pressed");
  const snowStored = await page.evaluate(() => localStorage.getItem("vila.site.snow.v1"));
  check(pressedBefore === "true" && pressedAfter === "false", `snow: aria-pressed ${pressedBefore} → ${pressedAfter}`);
  check(snowStored === "off", `snow: not persisted (${snowStored})`);

  // In-page navigation.
  await page.getByRole("link", { name: "Doações" }).first().click();
  const hash = await page.evaluate(() => window.location.hash);
  check(hash === "#doacoes", `nav: expected #doacoes, got ${hash}`);

  check(problems.length === 0, problems.join(" | "));
  await page.close();
  await context.close();
}

/* ------------------------------------------------------- preferences & stress */
{
  const reduced = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
  const reducedPage = await reduced.newPage();
  await reducedPage.goto(`${base}/`, { waitUntil: "networkidle" });
  const still = await reducedPage.evaluate(() => {
    const bulb = document.querySelector(".garland__bulb");
    const canvas = document.querySelector(".voxel-snow");
    return { animation: bulb ? getComputedStyle(bulb).animationName : "missing", canvas: !!canvas };
  });
  check(still.animation === "none", `reduced motion: garland still animates (${still.animation})`);
  check(still.canvas, "reduced motion: snow canvas missing (static frost expected)");
  await reducedPage.close();
  await reduced.close();

  for (const [name, options] of [
    ["forced-colors", { forcedColors: "active" }],
    ["contrast", { contrast: "more" }],
  ]) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, ...options });
    const probe = await context.newPage();
    const problems = watch(probe, name);
    await probe.goto(`${base}/`, { waitUntil: "networkidle" });
    const visible = await probe.evaluate(() => {
      const main = document.querySelector("main");
      return !!main && main.getBoundingClientRect().height > 400 && document.documentElement.scrollWidth <= window.innerWidth;
    });
    check(visible, `${name}: content not usable`);
    check(problems.length === 0, problems.join(" | "));
    await probe.close();
    await context.close();
  }

  const stress = await browser.newContext({ viewport: { width: 320, height: 720 } });
  const stressPage = await stress.newPage();
  const stressProblems = watch(stressPage, "stress");
  await stressPage.goto(`${base}/`, { waitUntil: "networkidle" });
  const overflow = await stressPage.evaluate(() => {
    // 200% text zoom: double the root size and re-measure the reflow.
    document.documentElement.style.fontSize = "32px";
    const zoom = { width: document.documentElement.scrollWidth, viewport: window.innerWidth };
    document.documentElement.style.fontSize = "";
    // Absurd content: long unbroken token, CJK, RTL and emoji in the live page.
    const lead = document.querySelector(".hero .lead");
    const heading = document.querySelector("#como-funciona h2");
    if (lead) lead.textContent = `${"Organizações".repeat(6)} www.vilanoeldobem.com.br/${"muito-longo".repeat(5)} 日本語のテキスト مرحبا بالعالم 🎄🎁`;
    if (heading) heading.textContent = "Como funciona com um título absurdamente longo que precisa quebrar sem empurrar a página";
    const stretched = { width: document.documentElement.scrollWidth, viewport: window.innerWidth };
    return { zoom, stretched };
  });
  check(overflow.zoom.width <= overflow.zoom.viewport, `text zoom 200%: overflow ${overflow.zoom.width} > ${overflow.zoom.viewport}`);
  check(overflow.stretched.width <= overflow.stretched.viewport, `stress content: overflow ${overflow.stretched.width} > ${overflow.stretched.viewport}`);
  check(stressProblems.length === 0, stressProblems.join(" | "));

  // Print styles: decorative layers dropped, content kept.
  await stressPage.emulateMedia({ media: "print" });
  const print = await stressPage.evaluate(() => {
    const snow = document.querySelector(".voxel-snow");
    const skyline = document.querySelector(".skyline");
    return { snow: snow ? getComputedStyle(snow).display : "missing", skyline: skyline ? getComputedStyle(skyline).display : "missing" };
  });
  check(print.snow === "none" && print.skyline === "none", `print: decorations still printed ${JSON.stringify(print)}`);
  await stressPage.close();
  await stress.close();
}

await browser.close();

if (failures.length > 0) {
  console.error(`${failures.length} failure(s):\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`ok — ${passes.loads} route loads, ${passes.assertions} assertions, screenshots in ${out}`);
