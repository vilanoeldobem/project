import { CYCLE } from "@vila/shared/environment/config";
import { dayPhase, saoPauloCivil, type DayPhase } from "@vila/shared/environment/time";

/**
 * Village clock for the "Hora na Vila (SP)" pill. Same civil clock and artistic phases as the game
 * (IMPL-0006): America/Sao_Paulo through Intl and the shared `CYCLE` boundaries, so the site can
 * never drift from the game when a boundary changes.
 */

export interface VillageNow {
  /** São Paulo wall-clock time, `HH:MM` (24 h). */
  time: string;
  /** pt-BR label of the current artistic phase. */
  phase: string;
}

const PHASE_LABELS: Record<DayPhase, string> = {
  dawn: "Amanhecer na Vila",
  day: "Dia na Vila",
  dusk: "Entardecer na Vila",
  night: "Noite na Vila",
};

const pad = (value: number) => String(value).padStart(2, "0");

export function villageNow(epochMs: number): VillageNow {
  const civil = saoPauloCivil(epochMs);
  return {
    time: `${pad(civil.hour)}:${pad(civil.minute)}`,
    phase: PHASE_LABELS[dayPhase(epochMs, CYCLE).kind],
  };
}
