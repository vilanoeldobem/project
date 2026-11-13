/**
 * arrive.mjs — what every browser check does right after opening the game (IMPL-0022). The visitor lands in
 * the village: there is no welcome dialog to click through any more, so the checks do not click one. This
 * waits for the HUD and records a failure when a dialog opened by itself or the way into the game menu (the
 * "Menu" button of the HUD) is missing.
 *
 * `errors` is the run's list of failures; `name` says which page. Pages that are expected to open a panel at
 * arrival (none today) must not call this.
 */
export async function arrive(page, errors, name = "arrival", { timeout = 20000 } = {}) {
  await page
    .getByRole("button", { name: "Menu", exact: true })
    .waitFor({ timeout })
    .catch(() => errors.push(`${name}: the HUD did not render (no "Menu" button)`));
  if (await page.getByRole("dialog").count()) errors.push(`${name}: a dialog is open on arrival (the village must open with none)`);
  if (await page.getByRole("button", { name: "Entrar na Vila", exact: true }).count()) errors.push(`${name}: the welcome screen is back ("Entrar na Vila")`);
}
