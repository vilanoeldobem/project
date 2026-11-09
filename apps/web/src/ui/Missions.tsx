import { useVila } from "../game/store";
import { levelOf, MISSIONS, TRACK_LABEL, XP_PER_LEVEL, type Track } from "../game/progress";
import { Panel } from "./Panel";

/** Mission log (P14, DEC-039/040). Progress is saved in this browser only (accounts are D06). */
export function Missions() {
  const p = useVila((s) => s.progress);
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
      <p className="note">Seu progresso fica salvo neste navegador.</p>
    </Panel>
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
