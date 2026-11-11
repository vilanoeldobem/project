import { COSMETICS, isUnlocked, requirement, SLOTS, type Slot } from "@vila/shared/game/cosmetics";

import { useVila } from "../game/store";
import { levelOf, MISSIONS, TRACK_LABEL, XP_PER_LEVEL, type Track } from "@vila/shared/game/progress";
import { Panel } from "./Panel";

/** Mission log (P14, DEC-039/040). Guests stay local; account progress is synchronized with the API. */
export function Missions() {
  const p = useVila((s) => s.progress);
  const status = useVila((s) => s.progressStatus);
  return (
    <Panel kicker="Missões da Vila" title="Caderno de Missões">
      <XpBar />
      {(Object.keys(TRACK_LABEL) as Track[]).map((track) => (
        <section key={track} className="track">
          <h3>{TRACK_LABEL[track]}</h3>
          <ul className="mission-list">
            {MISSIONS.filter((m) => m.track === track).map((m) => {
              const n = p.counters[m.id] ?? 0;
              const done = Boolean(p.completed[m.id]);
              return (
                <li key={m.id} className={done ? "done" : ""}>
                  <span aria-hidden>{done ? "★" : "☆"}</span>
                  <span>
                    {m.title}
                    <small>
                      {n}/{m.target} {m.unit} · {m.xp} XP
                    </small>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <LookPicker />
      <p className="note" role="status">{status === "guest" ? "Seu progresso de visitante fica salvo neste navegador." : status === "saved" ? "Missões e XP salvos na conta. A aparência continua neste navegador." : status === "offline" ? "Progresso pendente de sincronização. Abra Minha conta para tentar novamente." : "Sincronizando seu progresso…"}</p>
    </Panel>
  );
}

const SLOT_LABEL: Record<Slot, string> = { hat: "Chapéu", scarf: "Cachecol", sweater: "Suéter", palette: "Cores" };

/**
 * Avatar look (PROPOSTA): items unlock only by completing missions or reaching levels — never by buying,
 * drawing lots or time online. Locked items say exactly how to get them.
 */
function LookPicker() {
  const p = useVila((s) => s.progress);
  const look = useVila((s) => s.look);
  const setLook = useVila((s) => s.setLook);
  return (
    <section className="track look">
      <h3>Visual do avatar</h3>
      {SLOTS.map((slot) => (
        <fieldset key={slot} className="look__slot">
          <legend>{SLOT_LABEL[slot]}</legend>
          <div className="look__options">
            {COSMETICS.filter((c) => c.slot === slot).map((c) => {
              const open = isUnlocked(c, p);
              return (
                <button
                  key={c.id}
                  className={`btn btn--chip look__item${look[slot] === c.id ? " is-on" : ""}`}
                  aria-pressed={look[slot] === c.id}
                  disabled={!open}
                  title={open ? c.name : requirement(c)}
                  onClick={() => setLook({ [slot]: c.id })}
                >
                  {open ? c.name : `🔒 ${c.name}`}
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}
      <p className="note">Visuais novos chegam ao concluir missões e subir de nível. Nada aqui se compra.</p>
    </section>
  );
}

export function XpBar({ compact }: { compact?: boolean }) {
  const xp = useVila((s) => s.progress.xp);
  const into = xp % XP_PER_LEVEL;
  return (
    <div className={`xp${compact ? " xp--compact" : ""}`} aria-label={`Nível ${levelOf(xp)}, ${into} de ${XP_PER_LEVEL} XP`}>
      <span className="xp__level">Nv {levelOf(xp)}</span>
      <span className="xp__bar">
        <span style={{ width: `${(into / XP_PER_LEVEL) * 100}%` }} />
      </span>
      <span className="xp__num">
        {into}/{XP_PER_LEVEL} XP
      </span>
    </div>
  );
}
