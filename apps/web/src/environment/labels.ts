/** User-facing environment copy (pt-BR, IMPL-0004). */
import type { WorldEventKind } from "./events";
import type { DayPhase } from "./time";
import type { WeatherKind } from "./weather";

export const WEATHER_LABEL: Record<WeatherKind, { label: string; icon: string }> = {
  CLEAR_FROST: { label: "Céu limpo e geada", icon: "✨" },
  LIGHT_SNOW: { label: "Neve leve", icon: "🌨️" },
  SNOW: { label: "Nevando", icon: "❄️" },
  HEAVY_SNOW: { label: "Neve forte", icon: "❄️" },
  BLIZZARD: { label: "Nevasca mágica", icon: "🌬️" },
  MISTY_FROST: { label: "Névoa gelada", icon: "🌫️" },
};

export const PHASE_LABEL: Record<DayPhase, string> = {
  dawn: "Amanhecer",
  day: "Dia",
  dusk: "Entardecer",
  night: "Noite",
};

export const EVENT_LABEL: Record<WorldEventKind, string> = {
  CHRISTMAS_EVE_SPARKLES: "Véspera de Natal",
  CHRISTMAS_DAY: "Dia de Natal",
  NEW_YEAR_SPARKLES: "Virada do Ano",
};
