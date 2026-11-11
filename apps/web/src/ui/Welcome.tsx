import { useVila } from "../game/store";
import { Wordmark } from "./Wordmark";

/** Entry screen (P01): three paths — explore NGOs, play, global donation (DEC-026). */
export function Welcome() {
  const open = useVila((s) => s.open);
  const close = useVila((s) => s.close);
  return (
    <div className="backdrop backdrop--welcome">
      <div className="welcome" role="dialog" aria-modal="true" aria-label="Boas-vindas">
        <Wordmark large />
        <p className="welcome__promise">Um lugar para viver o Natal, compartilhar alegria e encontrar oportunidades de fazer o bem.</p>
        <div className="welcome__paths">
          <button className="btn btn--path" onClick={() => open({ kind: "explore" })}>
            <span aria-hidden>🏡</span> Explorar ONGs
          </button>
          <button className="btn btn--path" onClick={() => open({ kind: "memory" })}>
            <span aria-hidden>🎲</span> Jogar
          </button>
          <button className="btn btn--path" onClick={() => open({ kind: "donation" })}>
            <span aria-hidden>🎄</span> Doação global
          </button>
        </div>
        <button className="btn btn--primary" onClick={close} autoFocus>
          Entrar na Vila
        </button>
        <button className="btn" onClick={() => open({ kind: "account" })}>Criar conta ou entrar</button>
        <p className="hint">Ande com WASD / setas ou toque no chão. Chegue perto da árvore e dos terrenos para interagir.</p>
        <p className="disclaimer">Versão de desenvolvimento · conteúdo e visual em definição.</p>
      </div>
    </div>
  );
}
