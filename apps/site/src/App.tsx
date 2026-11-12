import type { KeyboardEvent } from "react";
import { useEffect, useRef, useState } from "react";

import { GAME_URL } from "./config";
import {
  VoxelArrowIcon,
  VoxelChaletHeartIcon,
  VoxelCheckShieldIcon,
  VoxelClockIcon,
  VoxelCrestMark,
  VoxelGameIcon,
  VoxelGarland,
  VoxelMissionIcon,
  VoxelPlazaIcon,
  VoxelSkyIcon,
  VoxelSnowflakeIcon,
  VoxelTreeGlobeIcon,
  VoxelVillageSkyline,
} from "./VoxelArt";
import { VoxelSnow } from "./VoxelSnow";
import { villageNow, type VillageNow } from "./villageClock";

/**
 * Public landing page (www.*). Copy is pt-BR and uses only approved wording: purpose and promise
 * (DEC-021); donation rules (DEC-010..013, DEC-026, DEC-029); NGO criteria (DEC-015); deadline
 * (DEC-043). No slogan is used (PEN-015). No logo is approved yet (DEC-024, PEN-016), so the brand
 * is the temporary text wordmark (IMPL-0005, decision 3). The star-and-pine mark beside it is
 * decorative voxel art drawn in code, not a logo: no logo image may be shown as the brand here.
 */

const THEME_KEY = "vila.site.theme.v1";
const SNOW_KEY = "vila.site.snow.v1";

type Theme = "light" | "dark";

interface Scene {
  id: string;
  label: string;
  webp: string;
  jpg: string;
  alt: string;
  caption: string;
}

/** Real frames of the game (apps/client), captured with the shared weather/time contract. */
const SCENES: Scene[] = [
  {
    id: "praca",
    label: "Praça nevada",
    webp: "/img/praca.webp",
    jpg: "/img/praca.jpg",
    alt: "A praça nevada da Vila em voxel art ao entardecer: árvore de Natal ao centro, cordões de lâmpadas coloridas, bonecos de neve, barracas do mercado e o ponto da doação global.",
    caption: "Praça nevada ao entardecer · árvore central, cordões de lâmpadas, bonecos de neve e o mercado.",
  },
  {
    id: "noite",
    label: "Noite de neve",
    webp: "/img/praca-noite.webp",
    jpg: "/img/praca-noite.jpg",
    alt: "A praça da Vila sob neve forte à noite, com os cordões de lâmpadas acesos e a árvore iluminada ao centro.",
    caption: "Clima compartilhado · neve forte às 19h, com a praça iluminada pela mesma hora de São Paulo.",
  },
  {
    id: "missoes",
    label: "Missões e visual",
    webp: "/img/praca-missoes.webp",
    jpg: "/img/praca-missoes.jpg",
    alt: "Avatar em voxel de gorro vermelho, visto de costas, na praça nevada diante da árvore de Natal; ao lado, o ponto da doação global; no canto, o painel de missões marca 0 de 4 missões, nível 1 e 0 de 100 XP.",
    caption: "Missões da Vila · no canto, o painel mostra as missões, o nível e a experiência; adiante, a árvore e o ponto da doação global.",
  },
];

function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function store(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage blocked (private mode): the choice lasts for this visit only.
  }
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function App() {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = readStored(THEME_KEY);
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });
  const [snow, setSnow] = useState(() => readStored(SNOW_KEY) !== "off");
  const [reduced, setReduced] = useState(prefersReducedMotion);
  const [announcement, setAnnouncement] = useState("");
  const [scene, setScene] = useState(0);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const now = useVillageClock();

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    // One unmedia'd meta wins over the two prefers-color-scheme defaults from index.html.
    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]:not([media])');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.appendChild(meta);
    }
    meta.content = theme === "dark" ? "#07201B" : "#0C3A30";
  }, [theme]);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(query.matches);
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  const toggleTheme = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    store(THEME_KEY, next);
    setAnnouncement(next === "dark" ? "Tema noturno ativado." : "Tema diurno ativado.");
  };

  const toggleSnow = () => {
    const next = !snow;
    setSnow(next);
    store(SNOW_KEY, next ? "on" : "off");
    setAnnouncement(
      !next ? "Neve desligada." : reduced ? "Neve ligada. Com movimento reduzido, a neve fica parada." : "Neve ligada.",
    );
  };

  const onTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const last = SCENES.length - 1;
    // Arrow keys move from the focused tab (roving tabindex), not from the last selection.
    const origin = Math.max(0, tabRefs.current.indexOf(event.target as HTMLButtonElement));
    const next =
      event.key === "ArrowRight"
        ? activeNeighbour(origin, 1, last)
        : event.key === "ArrowLeft"
          ? activeNeighbour(origin, -1, last)
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    setScene(next);
    tabRefs.current[next]?.focus();
  };

  const current = SCENES[scene] ?? SCENES[0];

  return (
    <>
      {/* Snow off: no canvas at all. Snow on with reduced motion: one still frost frame. */}
      {snow ? <VoxelSnow animated={!reduced} /> : null}
      <a className="skip-link" href="#conteudo">
        Pular para o conteúdo
      </a>

      <header className="top">
        <div className="top__bar">
          <div className="top__row top__row--brand">
            <a className="brand" href="/" aria-label="Vila Noel do Bem — início">
              <VoxelCrestMark size={34} />
              <span className="wordmark">
                <span>VILA NOEL</span>
                <span>DO BEM</span>
              </span>
            </a>
            <button
              type="button"
              className="chip-btn top__theme"
              aria-pressed={theme === "dark"}
              aria-label={theme === "dark" ? "Tema noturno ativo (noite). Mudar para o dia" : "Tema diurno ativo (dia). Mudar para a noite"}
              onClick={toggleTheme}
            >
              <span className="chip-btn__icon">
                <VoxelSkyIcon night={theme === "dark"} />
              </span>
              <span className="chip-btn__label">{theme === "dark" ? "Noite" : "Dia"}</span>
            </button>
            <button
              type="button"
              className="chip-btn top__snow"
              aria-pressed={snow}
              aria-label={snow ? "Neve ligada. Desligar a neve" : "Neve desligada. Ligar a neve"}
              onClick={toggleSnow}
            >
              <span className="chip-btn__icon">
                <VoxelSnowflakeIcon />
              </span>
              <span className="chip-btn__label">Neve</span>
            </button>
          </div>

          <div className="top__row top__row--nav">
            <nav className="nav" aria-label="Navegação principal">
              <a className="nav-link" href="#como-funciona">
                Como funciona
              </a>
              <a className="nav-link" href="#doacoes">
                Doações
              </a>
              <a className="nav-link" href="#ongs">
                Para ONGs
              </a>
            </nav>
            <a className="btn btn--primary btn--header top__cta" href={GAME_URL}>
              Entrar na Vila
            </a>
          </div>
        </div>
        <VoxelGarland steady={reduced} />
        <p className="sr-only" aria-live="polite">
          {announcement}
        </p>
      </header>

      <main id="conteudo">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero__inner">
            <div className="hero__content">
              <div className="hero__status">
                <p className="status-pill">
                  <VoxelClockIcon />
                  <span>Hora na Vila (SP)</span>
                  <strong>{now.time}</strong>
                </p>
                <p className="status-pill status-pill--muted">
                  <span className="status-pill__dot" aria-hidden="true" />
                  <span>{now.phase}</span>
                </p>
              </div>

              <h1 id="hero-title">Um lugar para viver o Natal, compartilhar alegria e encontrar oportunidades de fazer o bem.</h1>
              <p className="lead">
                Explore uma vila natalina nevada em voxel art, jogue minijogos gratuitos e conheça organizações sociais —
                direto no navegador, no computador ou no celular.
              </p>

              <div className="actions">
                <a className="btn btn--primary btn--lg" href={GAME_URL}>
                  Entrar na Vila
                </a>
                <a className="btn btn--secondary" href="#como-funciona">
                  Explorar como funciona
                </a>
              </div>

              <p className="hero__hint">
                <VoxelSnowflakeIcon size={16} />
                No jogo, ande clicando ou tocando no chão. Jogar nunca é uma doação.
              </p>
            </div>

            <div className="hero__diorama">
              <figure className="diorama">
                <div className="diorama__tabs" role="tablist" aria-label="Cenas da Vila" onKeyDown={onTabKeyDown}>
                  {SCENES.map((item, index) => (
                    <button
                      key={item.id}
                      ref={(element) => {
                        tabRefs.current[index] = element;
                      }}
                      type="button"
                      role="tab"
                      id={`scene-tab-${item.id}`}
                      className="diorama__tab"
                      aria-selected={index === scene}
                      aria-controls={`scene-panel-${item.id}`}
                      tabIndex={index === scene ? 0 : -1}
                      onClick={() => setScene(index)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <div
                  className="diorama__frame"
                  role="tabpanel"
                  id={`scene-panel-${current.id}`}
                  aria-labelledby={`scene-tab-${current.id}`}
                  tabIndex={0}
                >
                  <picture>
                    <source srcSet={current.webp} type="image/webp" />
                    <img
                      className="diorama__img"
                      src={current.jpg}
                      width={1440}
                      height={900}
                      alt={current.alt}
                      fetchPriority={scene === 0 ? "high" : "auto"}
                      decoding="async"
                    />
                  </picture>
                </div>
                <figcaption className="diorama__caption">{current.caption}</figcaption>
              </figure>
            </div>
          </div>
        </section>

        <section id="como-funciona" className="section" aria-labelledby="como-funciona-title">
          <div className="section__inner">
            <div className="section__intro">
              <h2 id="como-funciona-title">Como funciona</h2>
              <p className="section__lead">
                Ande pela praça, jogue minijogos gratuitos e visite os terrenos onde organizações sociais aprovadas abrem
                suas casas.
              </p>
            </div>

            <div className="feature-layout">
              <article className="feature-stage">
                <div className="feature-stage__art">
                  <VoxelPlazaIcon />
                  <h3>Explorar a praça e visitar causas</h3>
                </div>
                <p>
                  Ande clicando ou tocando no chão, encontre presentes escondidos na neve e visite os terrenos onde
                  organizações sociais aprovadas abrem suas casas. Dá para entrar sem criar conta.
                </p>
                <a className="inline-cta" href={GAME_URL}>
                  Passear pela praça agora
                  <VoxelArrowIcon />
                </a>
              </article>

              <div className="feature-rail">
                <article className="feature-item">
                  <VoxelGameIcon />
                  <h3>Jogar gratuitamente</h3>
                  <p>
                    Minijogos simples e gratuitos. O Jogo da Memória já está disponível; outros chegam aos poucos. Jogar
                    nunca é uma doação.
                  </p>
                </article>
                <article className="feature-item">
                  <VoxelMissionIcon />
                  <h3>Subir de nível nas Missões da Vila</h3>
                  <p>
                    Complete missões nas trilhas Explorar, Brincar e Conhecer causas para ganhar experiência e desbloquear
                    visuais — sem precisar doar.
                  </p>
                </article>
              </div>
            </div>
          </div>
        </section>

        <section id="doacoes" className="section section--tonal" aria-labelledby="doacoes-title">
          <div className="section__inner">
            <div className="section__intro">
              <h2 id="doacoes-title">Doação com transparência</h2>
              <p className="section__lead">O destinatário aparece sempre antes de qualquer pagamento.</p>
            </div>

            <div className="donation-split">
              <article className="donation-path">
                <div className="donation-path__head">
                  <VoxelTreeGlobeIcon />
                  <h3>Doação global</h3>
                </div>
                <p>
                  Na praça, você pode doar sem escolher uma ONG específica. O valor vai para{" "}
                  <strong>uma única instituição parceira</strong>, independente, que decide a destinação conforme seus
                  programas. A Vila não divide essas doações entre as ONGs.
                </p>
                <p className="pill">
                  <VoxelClockIcon size={18} />
                  Instituição parceira: em definição
                </p>
              </article>

              <article className="donation-path">
                <div className="donation-path__head">
                  <VoxelChaletHeartIcon />
                  <h3>Doação direta para uma ONG</h3>
                </div>
                <p>
                  Dentro da casa de cada organização aprovada, você doa diretamente para ela. O destinatário aparece
                  sempre antes de qualquer pagamento.
                </p>
                <p className="pill">
                  <VoxelClockIcon size={18} />
                  Doações aguardam contrato e meio de pagamento
                </p>
              </article>
            </div>
          </div>
        </section>

        <section id="ongs" className="section" aria-labelledby="ongs-title">
          <div className="section__inner">
            <div className="ngo-layout">
              <div className="ngo-copy">
                <h2 id="ongs-title">Para organizações sociais</h2>
                <p className="lead">Os terrenos da Vila estão abertos para organizações que atendem a três critérios:</p>
                <p className="note">
                  Toda candidatura passa por análise; só a aprovação publica a casa na Vila. O cadastro de ONGs abre em
                  breve.
                </p>
              </div>

              <ol className="criteria-list">
                <li>
                  <VoxelCheckShieldIcon />
                  <span>CNPJ ativo.</span>
                </li>
                <li>
                  <VoxelCheckShieldIcon />
                  <span>Pelo menos 1 ano de existência.</span>
                </li>
                <li>
                  <VoxelCheckShieldIcon />
                  <span>Um meio confiável de confirmar os valores destinados à organização.</span>
                </li>
              </ol>
            </div>
          </div>
        </section>

        <section className="cta-banner" aria-labelledby="cta-title">
          <div className="cta-banner__inner">
            <h2 id="cta-title">A Vila já está acesa.</h2>
            <p>Ela cresce até o lançamento, previsto para 30 de novembro de 2026.</p>
            <a className="btn btn--primary btn--lg" href={GAME_URL}>
              Entrar na Vila
            </a>
          </div>
        </section>
      </main>

      <VoxelVillageSkyline />
      <footer className="footer">
        <div className="footer__inner">
          <p>© 2026 Vila Noel do Bem</p>
          <p className="footer__note">
            Transformar a magia do Natal em experiências que aproximam pessoas, despertam alegria e estimulam a
            solidariedade.
          </p>
        </div>
      </footer>
    </>
  );
}

/** Wraps focus and selection around the tab list (roving tabindex). */
function activeNeighbour(current: number, step: 1 | -1, last: number): number {
  if (step === 1) return current >= last ? 0 : current + 1;
  return current <= 0 ? last : current - 1;
}

/** São Paulo village clock, refreshed every 30 s (minute precision). */
function useVillageClock(): VillageNow {
  const [now, setNow] = useState<VillageNow>(() => villageNow(Date.now()));
  useEffect(() => {
    const id = window.setInterval(() => setNow(villageNow(Date.now())), 30_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}
