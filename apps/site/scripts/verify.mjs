/**
 * verify.mjs — full-site verification for the public website in a real Chrome
 * (playwright-core + system Chrome).
 *
 * Contract: every route (`/`, `/404.html`) is loaded at the eight required widths in both
 * colour themes, with no console error, no failed request, no horizontal overflow, every
 * "Entrar na Vila" pointing at the game, every image loaded with explicit dimensions, every
 * section link visible without sideways scrolling, and every interactive control at least
 * 44×44 CSS px. Interaction, comfort, zoom, preference and stress checks run once on top of the
 * matrix: keyboard order and focus-ring contrast (>= 3:1 against what is painted behind the ring),
 * what the snow canvas really paints (on, off, reduced motion), high-contrast tokens, the
 * no-JavaScript fallback. Screenshots go to verify-output/.
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

/**
 * In-page helpers, installed as `window.__verify` through the DevTools protocol (so the site CSP,
 * which forbids inline scripts, does not get in the way). Runs in the browser, not in Node.
 */
function pageHelpers() {
  const probe = document.createElement("canvas");
  probe.width = 1;
  probe.height = 1;
  const ctx = probe.getContext("2d", { willReadFrequently: true });

  /** Any CSS colour (oklch included) → [r, g, b, alpha] in sRGB. */
  const rgba = (color) => {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    return [r, g, b, a / 255];
  };
  const over = (top, bottom) => [0, 1, 2].map((i) => top[i] * top[3] + bottom[i] * (1 - top[3])).concat(1);
  const luminance = (color) => {
    const [r, g, b] = color.slice(0, 3).map((value) => {
      const v = value / 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  /** WCAG contrast ratio of two opaque colours. */
  const contrast = (a, b) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  /** Opaque colour painted behind a viewport point, ignoring `skip` and what is inside it. */
  const backdropAt = (x, y, skip) => {
    let color = [255, 255, 255, 1];
    const stack = document.elementsFromPoint(x, y).filter((element) => !skip || !skip.contains(element));
    for (const element of stack.reverse()) color = over(rgba(getComputedStyle(element).backgroundColor), color);
    return color;
  };
  const name = (element) =>
    `${element.tagName.toLowerCase()}:${(element.getAttribute("aria-label") ?? element.textContent ?? "").trim().slice(0, 28)}`;

  return {
    /** The focused element, its ring and the ring's contrast against what is painted behind it. */
    focusStop() {
      const element = document.activeElement;
      if (!element || element === document.body) return null;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const reach = parseFloat(style.outlineOffset) + parseFloat(style.outlineWidth) / 2;
      const middleX = rect.left + rect.width / 2;
      const middleY = rect.top + rect.height / 2;
      const points = [
        [rect.left - reach, middleY],
        [rect.right + reach, middleY],
        [middleX, rect.top - reach],
        [middleX, rect.bottom + reach],
      ].filter(([x, y]) => x >= 0 && y >= 0 && x < window.innerWidth && y < window.innerHeight);
      const ring = rgba(style.outlineColor);
      const ratios = points.map(([x, y]) => {
        const backdrop = backdropAt(x, y, element);
        return contrast(over(ring, backdrop), backdrop);
      });
      return {
        label: name(element),
        masthead: !!element.closest(".top, .skip-link"),
        inHeader: !!element.closest(".top"),
        outlineStyle: style.outlineStyle,
        outlineWidth: parseFloat(style.outlineWidth),
        ratio: ratios.length > 0 ? Math.round(Math.min(...ratios) * 100) / 100 : null,
        left: Math.round(rect.left + window.scrollX),
        right: Math.round(rect.right + window.scrollX),
        top: Math.round(rect.top + window.scrollY),
        bottom: Math.round(rect.bottom + window.scrollY),
      };
    },
    /** What the snow canvas holds right now: null when there is no canvas. */
    snowFrame() {
      const canvas = document.querySelector(".voxel-snow");
      if (!canvas) return null;
      const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
      let painted = 0;
      let hash = 0;
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] === 0) continue;
        painted += 1;
        hash = (Math.imul(hash, 31) + i) >>> 0;
      }
      return { painted, hash };
    },
    /** Text contrast of an element against the colour painted behind its centre. */
    textContrast(selector) {
      const element = document.querySelector(selector);
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      const backdrop = backdropAt(rect.left + rect.width / 2, rect.top + rect.height / 2, null);
      return Math.round(contrast(over(rgba(getComputedStyle(element).color), backdrop), backdrop) * 100) / 100;
    },
    token(name) {
      return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    },
    /** Resolves once smooth scrolling (focus moving down the page) has stopped. */
    scrollSettled() {
      return new Promise((resolve) => {
        let last = window.scrollY;
        let still = 0;
        const step = () => {
          still = window.scrollY === last ? still + 1 : 0;
          last = window.scrollY;
          if (still >= 6) resolve();
          else requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
    },
  };
}

const installHelpers = (page) => page.evaluate(`window.__verify = (${pageHelpers.toString()})()`);

/** Tabs through the page from the top and returns every keyboard stop, in order. */
async function keyboardStops(page, limit = 40) {
  const stops = [];
  for (let i = 0; i < limit; i += 1) {
    await page.keyboard.press("Tab");
    await page.evaluate(() => window.__verify.scrollSettled());
    const stop = await page.evaluate(() => window.__verify.focusStop());
    if (!stop || stops.some((seen) => seen.label === stop.label && seen.top === stop.top && seen.left === stop.left)) break;
    stops.push(stop);
  }
  return stops;
}

/** Two snow frames `gap` ms apart. */
async function snowFrames(page, gap = 350) {
  const first = await page.evaluate(() => window.__verify.snowFrame());
  await page.waitForTimeout(gap);
  const second = await page.evaluate(() => window.__verify.snowFrame());
  return { first, second };
}

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
      // Section links must be fully on screen: no sideways scroller, nothing clipped.
      hiddenNav: [...document.querySelectorAll(".nav-link, .top__cta")]
        .filter((link) => {
          const rect = link.getBoundingClientRect();
          return rect.width === 0 || rect.left < 0 || rect.right > window.innerWidth + 0.5;
        })
        .map((link) => (link.textContent ?? "").trim()),
      navScrolls: [...document.querySelectorAll(".nav")].some((nav) => nav.scrollWidth > nav.clientWidth + 1),
      logoImages: [...document.images].map((image) => image.currentSrc || image.src).filter((src) => /logo/i.test(src)),
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
  check(facts.hiddenNav.length === 0, `${label}: header links off screen ${JSON.stringify(facts.hiddenNav)}`);
  check(!facts.navScrolls, `${label}: the section nav scrolls sideways`);
  // No logo is approved (DEC-024, PEN-016): the brand is the temporary text wordmark (IMPL-0005).
  check(facts.logoImages.length === 0, `${label}: logo image on the page ${JSON.stringify(facts.logoImages)}`);
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

/* ------------------------------------------------- keyboard order and focus */
for (const [width, height, scheme] of [
  [1280, 800, "light"],
  [1280, 800, "dark"],
  [375, 667, "light"],
  [375, 667, "dark"],
]) {
  const label = `focus ${width}px ${scheme}`;
  const context = await browser.newContext({ viewport: { width, height }, colorScheme: scheme });
  const page = await context.newPage();
  const problems = watch(page, label);
  await page.goto(`${base}/`, { waitUntil: "networkidle" });
  await installHelpers(page);
  const stops = await keyboardStops(page);
  const masthead = stops.filter((stop) => stop.masthead);

  // Skip link, brand, two comfort toggles, three section links and the CTA.
  check(masthead.length === 8, `${label}: expected 8 masthead stops, got ${JSON.stringify(masthead.map((stop) => stop.label))}`);
  check(stops.length > masthead.length, `${label}: keyboard never left the masthead`);
  for (const stop of stops) {
    check(stop.outlineStyle !== "none" && stop.outlineWidth >= 2, `${label}: no visible ring on ${stop.label}`);
    check(
      stop.ratio !== null && stop.ratio >= 3,
      `${label}: focus ring ${stop.ratio}:1 on ${stop.label}${stop.masthead ? " (masthead)" : ""}, needs 3:1`,
    );
  }
  // WCAG 2.4.3: each stop in the header sits after the previous one, on the same row or on a later row.
  const header = stops.filter((stop) => stop.inHeader);
  for (let i = 1; i < header.length; i += 1) {
    const [previous, current] = [header[i - 1], header[i]];
    const sameRowAfter = current.left >= previous.right - 1 && current.top < previous.bottom;
    const laterRow = current.top >= previous.bottom - 1;
    check(sameRowAfter || laterRow, `${label}: tab order jumps back from ${previous.label} to ${current.label}`);
  }

  if (width === 1280 && scheme === "light") {
    await page.keyboard.press("Shift+Tab");
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.locator(".nav-link").first().focus();
    await page.screenshot({ path: `${out}focus-masthead-light.png`, clip: { x: 0, y: 0, width, height: 120 } });
  }
  check(problems.length === 0, problems.join(" | "));
  await page.close();
  await context.close();
}

/* --------------------------------------------------------------- behaviour */
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: "light" });
  const page = await context.newPage();
  const problems = watch(page, "behaviour");
  await page.goto(`${base}/`, { waitUntil: "networkidle" });
  await installHelpers(page);

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

  // Theme: toggles, persists across reload and rewrites the browser chrome colour. The button keeps
  // one name; only aria-pressed changes.
  const themeChip = page.locator(".top__theme");
  const themeColors = () => page.evaluate(() => [...document.querySelectorAll('meta[name="theme-color"]')].map((meta) => meta.content));
  const before = await page.evaluate(() => document.documentElement.dataset.theme);
  const themeNameBefore = await themeChip.getAttribute("aria-label");
  check((await themeChip.getAttribute("aria-pressed")) === "false", "theme: light theme should not be pressed");
  check(JSON.stringify(await themeColors()) === JSON.stringify(["#0C3A30", "#0C3A30"]), `theme: light theme-color ${JSON.stringify(await themeColors())}`);
  await themeChip.click();
  const after = await page.evaluate(() => document.documentElement.dataset.theme);
  const stored = await page.evaluate(() => localStorage.getItem("vila.site.theme.v1"));
  check(before === "light" && after === "dark", `theme: toggle failed ${before} → ${after}`);
  check(stored === after, `theme: not persisted (${stored})`);
  check((await themeChip.getAttribute("aria-pressed")) === "true", "theme: aria-pressed did not follow the theme");
  check((await themeChip.getAttribute("aria-label")) === themeNameBefore, "theme: the button name changes with its state");
  // Both metas (one per system scheme) carry the chosen theme; no third, media-less meta.
  check(JSON.stringify(await themeColors()) === JSON.stringify(["#07201B", "#07201B"]), `theme: dark theme-color ${JSON.stringify(await themeColors())}`);
  await page.reload({ waitUntil: "networkidle" });
  await installHelpers(page);
  check((await page.evaluate(() => document.documentElement.dataset.theme)) === after, "theme: did not survive reload");

  // Snow: on by default and really moving; off means no flakes over the page at all.
  const snowChip = page.locator(".top__snow");
  const snowName = await snowChip.getAttribute("aria-label");
  const falling = await snowFrames(page);
  check((await snowChip.getAttribute("aria-pressed")) === "true", "snow: should start on");
  check(!!falling.first && falling.first.painted > 0, `snow: on but nothing painted ${JSON.stringify(falling.first)}`);
  check(!!falling.second && falling.first?.hash !== falling.second.hash, "snow: on with motion allowed, but the flakes do not move");
  await snowChip.click();
  const off = await page.evaluate(() => window.__verify.snowFrame());
  const snowStored = await page.evaluate(() => localStorage.getItem("vila.site.snow.v1"));
  check((await snowChip.getAttribute("aria-pressed")) === "false", "snow: aria-pressed did not follow the toggle");
  check(off === null || off.painted === 0, `snow: switched off but ${off?.painted} pixels are still painted`);
  check((await page.locator("p[aria-live]").innerText()) === "Neve desligada.", "snow: off not announced");
  check((await snowChip.getAttribute("aria-label")) === snowName, "snow: the button name changes with its state");
  check(snowStored === "off", `snow: not persisted (${snowStored})`);
  await page.screenshot({ path: `${out}snow-off.png` });
  await page.reload({ waitUntil: "networkidle" });
  await installHelpers(page);
  const offAfterReload = await page.evaluate(() => window.__verify.snowFrame());
  check(offAfterReload === null || offAfterReload.painted === 0, "snow: flakes came back after a reload with snow off");
  await snowChip.click();
  const backOn = await snowFrames(page);
  check(!!backOn.first && backOn.first.painted > 0, "snow: switched back on but nothing painted");
  check(!!backOn.second && backOn.first?.hash !== backOn.second.hash, "snow: switched back on but the flakes do not move");

  // Reading order of the NGO section: lead, criteria, note.
  const ngoOrder = await page.evaluate(() => {
    const [lead, list, note] = [".ngo-copy .lead", ".criteria-list", ".ngo-note"].map((selector) => document.querySelector(`#ongs ${selector}`));
    if (!lead || !list || !note) return null;
    const follows = (a, b) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    return { dom: follows(lead, list) && follows(list, note), noteBelowList: note.getBoundingClientRect().top >= list.getBoundingClientRect().bottom };
  });
  check(!!ngoOrder && ngoOrder.dom && ngoOrder.noteBelowList, `ngo: criteria must follow the lead and precede the note ${JSON.stringify(ngoOrder)}`);

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
  // Reduced motion: one still frost frame while the snow is on, and the toggle still removes it.
  const reduced = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
  const reducedPage = await reduced.newPage();
  const reducedProblems = watch(reducedPage, "reduced motion");
  await reducedPage.goto(`${base}/`, { waitUntil: "networkidle" });
  await installHelpers(reducedPage);
  const garland = await reducedPage.evaluate(() => {
    const bulb = document.querySelector(".garland__bulb");
    return bulb ? getComputedStyle(bulb).animationName : "missing";
  });
  check(garland === "none", `reduced motion: garland still animates (${garland})`);
  // Less motion must never mean new motion: the skip link appears in place, it does not slide in.
  await reducedPage.keyboard.press("Tab");
  const skipTop = await reducedPage.evaluate(() => document.activeElement?.getBoundingClientRect().top ?? -1);
  check(skipTop >= 0, `reduced motion: the skip link animates into view (top ${skipTop})`);
  const frost = await snowFrames(reducedPage);
  check(!!frost.first && frost.first.painted > 0, "reduced motion: static frost frame missing");
  check(!!frost.second && frost.first?.hash === frost.second.hash, "reduced motion: the snow still moves");
  const reducedChip = reducedPage.locator(".top__snow");
  await reducedChip.click();
  const frostOff = await reducedPage.evaluate(() => window.__verify.snowFrame());
  check((await reducedChip.getAttribute("aria-pressed")) === "false", "reduced motion: aria-pressed did not follow the toggle");
  check(frostOff === null || frostOff.painted === 0, `reduced motion: snow off but ${frostOff?.painted} pixels are still painted`);
  check((await reducedPage.locator("p[aria-live]").innerText()) === "Neve desligada.", "reduced motion: off not announced");
  await reducedChip.click();
  const frostOn = await snowFrames(reducedPage);
  check(!!frostOn.first && frostOn.first.painted > 0, "reduced motion: snow back on but nothing painted");
  check(!!frostOn.second && frostOn.first?.hash === frostOn.second.hash, "reduced motion: snow back on and moving");
  check(/parada/.test(await reducedPage.locator("p[aria-live]").innerText()), "reduced motion: still snow not announced");
  check(reducedProblems.length === 0, reducedProblems.join(" | "));
  await reducedPage.close();
  await reduced.close();

  // High contrast: the stronger tokens must really win in both themes (they are overridden at the
  // same specificity as the theme tokens).
  for (const scheme of ["light", "dark"]) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: scheme });
    const probe = await context.newPage();
    await probe.goto(`${base}/`, { waitUntil: "networkidle" });
    await installHelpers(probe);
    const tokens = () =>
      probe.evaluate(() => ({
        border: window.__verify.token("--border-subtle"),
        secondary: window.__verify.token("--text-secondary"),
        primary: window.__verify.token("--text-primary"),
        lead: getComputedStyle(document.querySelector(".section__lead")).color,
        heading: getComputedStyle(document.querySelector("h1")).color,
        theme: document.documentElement.dataset.theme,
      }));
    const normal = await tokens();
    await probe.emulateMedia({ contrast: "more" });
    const strong = await tokens();
    check(normal.theme === scheme, `contrast ${scheme}: wrong theme ${normal.theme}`);
    check(normal.secondary !== normal.primary, `contrast ${scheme}: secondary text is already the primary colour`);
    check(strong.secondary === strong.primary, `contrast ${scheme}: --text-secondary not raised (${strong.secondary})`);
    check(strong.lead === strong.heading, `contrast ${scheme}: secondary copy keeps its soft colour (${strong.lead})`);
    check(strong.border !== normal.border, `contrast ${scheme}: --border-subtle not raised (${strong.border})`);
    await probe.close();
    await context.close();
  }

  // No JavaScript: the fallback card must be readable in both colour schemes.
  for (const scheme of ["light", "dark"]) {
    const context = await browser.newContext({ viewport: { width: 375, height: 667 }, colorScheme: scheme, javaScriptEnabled: false });
    const probe = await context.newPage();
    await probe.goto(`${base}/`, { waitUntil: "load" });
    await installHelpers(probe);
    const ratios = await probe.evaluate(() =>
      ["noscript h1", "noscript p", "noscript a"].map((selector) => [selector, window.__verify.textContrast(selector)]),
    );
    for (const [selector, ratio] of ratios) {
      check(ratio !== null && ratio >= 4.5, `noscript ${scheme}: ${selector} contrast ${ratio}:1, needs 4.5:1`);
    }
    await probe.screenshot({ path: `${out}noscript-${scheme}.png` });
    await probe.close();
    await context.close();
  }

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
  await stressPage.evaluate(() => void (document.documentElement.style.fontSize = "32px"));
  await stressPage.screenshot({ path: `${out}mobile-320-text-200.png` });
  await stressPage.evaluate(() => void (document.documentElement.style.fontSize = ""));
  const overflow = await stressPage.evaluate(() => {
    // 200% text zoom: double the root size and re-measure the reflow.
    document.documentElement.style.fontSize = "32px";
    const zoom = {
      width: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
      hiddenNav: [...document.querySelectorAll(".nav-link, .top__cta")]
        .filter((link) => {
          const rect = link.getBoundingClientRect();
          return rect.width === 0 || rect.left < 0 || rect.right > window.innerWidth + 0.5;
        })
        .map((link) => (link.textContent ?? "").trim()),
      navScrolls: [...document.querySelectorAll(".nav")].some((nav) => nav.scrollWidth > nav.clientWidth + 1),
    };
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
  check(overflow.zoom.hiddenNav.length === 0, `text zoom 200%: header links off screen ${JSON.stringify(overflow.zoom.hiddenNav)}`);
  check(!overflow.zoom.navScrolls, "text zoom 200%: the section nav scrolls sideways");
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
