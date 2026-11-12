import { PALETTE } from "@vila/shared/game/world";

/**
 * Colours of the dashboard as CSS custom properties, taken from the product palette (doc 17 working palette,
 * PROPOSTA) so the game and the backoffice never drift apart. Set through the CSSOM, which the CSP allows
 * (no inline `style` attribute is written).
 */
export const THEME: Record<string, string> = {
  "--pine": PALETTE.pine,
  "--pine-light": PALETTE.pineLight,
  "--gold": PALETTE.gold,
  "--red": PALETTE.red,
  "--cream": PALETTE.cream,
  "--leaf": PALETTE.leaf,
  "--snow": PALETTE.snow,
  "--snow-shade": PALETTE.snowShade,
  "--stone": PALETTE.stoneDark,
  "--coal": PALETTE.coal,
};

export function applyTheme(root: HTMLElement): void {
  for (const [name, value] of Object.entries(THEME)) root.style.setProperty(name, value);
}
