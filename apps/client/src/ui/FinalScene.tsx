/** Final scene and credits (PROPOSTA, session 11): the six epilogue chains end here, in DOM text only. */
import type { Progress } from "@vila/shared/game/progress";
import { CREDITS, FINAL_SCENE, finalSceneReady } from "@vila/shared/game/quests-v2/catalog";

import { useVila } from "../game/store";
import { Panel } from "./Panel";

export function FinalScene({ progress }: { progress?: Progress }) {
  const stored = useVila((s) => s.progress);
  const close = useVila((s) => s.close);
  const p = progress ?? stored;
  const ready = finalSceneReady(p);
  return (
    <Panel
      board="P14"
      sheet
      icon="✨"
      title="A próxima Longa Noite"
      subtitle="Créditos e o fim da história"
      contentKey={ready ? "ready" : "locked"}
    >
      {ready ? (
        <>
          {FINAL_SCENE.map((line, i) => (
            <p key={line} className={i === 0 ? "lead" : undefined}>
              {line}
            </p>
          ))}
          <h3>Créditos</h3>
          <ul className="mission-list" aria-label="Créditos">
            {CREDITS.map((credit) => (
              <li key={credit.role}>
                <span aria-hidden>★</span>
                <span>
                  {credit.role}
                  <small>{credit.name}</small>
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="note">A cena final abre quando as seis cadeias do epílogo estiverem concluídas.</p>
      )}
      <button className="btn btn--primary" onClick={close}>
        Continuar
      </button>
    </Panel>
  );
}
