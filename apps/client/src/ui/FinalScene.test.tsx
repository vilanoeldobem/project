/** The final scene only shows its text and credits after the six epilogue chains; otherwise it explains the lock. */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { EMPTY_PROGRESS, type Progress } from "@vila/shared/game/progress";
import { EPILOGUE_FINAL_QUESTS, FINAL_SCENE } from "@vila/shared/game/quests-v2/catalog";

import { FinalScene } from "./FinalScene";

const done: Progress = {
  ...EMPTY_PROGRESS,
  completed: Object.fromEntries(EPILOGUE_FINAL_QUESTS.map((id) => [id, true] as const)),
};

describe("FinalScene", () => {
  it("shows the fixed scene and the fictional credits when the six chains are complete", () => {
    const page = renderToStaticMarkup(<FinalScene progress={done} />);
    expect(page).toContain(FINAL_SCENE[0]);
    expect(page).toContain("A Vila aprende a lembrar junto");
    expect(page).toContain("Créditos");
    expect(page).toContain("Brasa");
    expect(page).toContain("Você");
    expect(page).not.toContain("A cena final abre");
  });

  it("explains the lock before the six chains", () => {
    const page = renderToStaticMarkup(<FinalScene progress={EMPTY_PROGRESS} />);
    expect(page).toContain("A cena final abre quando as seis cadeias do epílogo estiverem concluídas.");
    expect(page).not.toContain("<h3>Créditos</h3>");
  });
});
