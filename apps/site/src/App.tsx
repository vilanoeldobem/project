import type { KeyboardEvent } from "react";
import { useEffect, useRef, useState } from "react";

import { GAME_URL } from "./config";
import {
  VoxelArrowIcon,
  VoxelChaletHeartIcon,
  VoxelCheckShieldIcon,
  VoxelClockIcon,
  VoxelGameIcon,
  VoxelGarland,
  VoxelMissionIcon,
  VoxelMoonIcon,
  VoxelPlazaIcon,
  VoxelSnowflakeIcon,
  VoxelVillageSkyline,
} from "./VoxelArt";
import { VoxelSnow } from "./VoxelSnow";
import { villageNow, type VillageNow } from "./villageClock";

/**
 * Public landing page (www.*). Copy is pt-BR and supplied by the product owner on 2026-11-27:
 * purpose and promise follow DEC-021, NGO criteria DEC-015, and every donation/candidacy
 * statement stays conditional (DEC-010..013, DEC-026, DEC-029). The opening line and footer
 * tagline are the copy's own words; no additional slogan is added. The brand is the in-test
 * logo (IMPL-0029): the Modelo B render, applied per the owner's instruction on 2026-11-18.
 * Final approval of the logo is still pending (DEC-024, PEN-016).
 */

const THEME_KEY = "vila.site.theme.v1";
const SNOW_KEY = "vila.site.snow.v1";

type Theme = "light" | "dark";

/** Browser chrome colour per theme: light `--surface-masthead`, dark `--canvas` (sRGB of the tokens). */
const THEME_COLOR: Record<Theme, string> = { light: "#0C3A30", dark: "#07201B" };

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
    // index.html ships one theme-color meta per colour scheme and the browser uses the one whose
    // media matches the system. Point both at the chosen theme, so a manual choice wins either way.
    for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
      meta.content = THEME_COLOR[theme];
    }
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
          {/* DOM order is the visual order at every width (WCAG 2.4.3): brand, comfort toggles, nav, CTA. */}
          <div className="top__row top__row--brand">
            <a className="brand" href="/" aria-label="Vila Noel do Bem — início">
              <img className="brandmark" src="/logo-vilanoeldobem.png" width={380} height={360} alt="" />
            </a>
            {/* Toggle buttons: the name never changes, `aria-pressed` alone carries the state. */}
            <button
              type="button"
              className="chip-btn top__theme"
              aria-pressed={theme === "dark"}
              aria-label="Noite: tema noturno"
              onClick={toggleTheme}
            >
              <span className="chip-btn__icon">
                <VoxelMoonIcon />
              </span>
              <span className="chip-btn__label">Noite</span>
            </button>
            <button type="button" className="chip-btn top__snow" aria-pressed={snow} aria-label="Neve" onClick={toggleSnow}>
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
              <a className="nav-link" href="#ongs">
                Para ONGs
              </a>
              <a className="nav-link" href="#doacoes">
                Doações e transparência
              </a>
              <a className="nav-link" href="#faq">
                Perguntas frequentes
              </a>
            </nav>
            <a className="btn btn--primary btn--header top__cta" href={GAME_URL}>
              Explorar a Vila
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

              <p className="hero__opening">Para quem quer se divertir. Para quem trabalha para fazer o bem.</p>
              <h1 id="hero-title">Um mundo para explorar. Um lugar para sua causa ser descoberta.</h1>
              <p className="lead">
                Entre em uma vila natalina em 3D, brinque gratuitamente e descubra, ao longo da experiência,
                organizações que fazem a diferença. ONGs aprovadas poderão ter casinhas virtuais para apresentar seu
                trabalho, compartilhar projetos e criar novas conexões com o público.
              </p>

              <div className="actions">
                <a className="btn btn--primary btn--lg" href={GAME_URL}>
                  Explorar a Vila agora
                </a>
                <a className="btn btn--secondary" href="#como-candidatar">
                  Como candidatar minha ONG
                </a>
              </div>
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
              <h2 id="como-funciona-title">Dois caminhos para viver a Vila</h2>
            </div>

            <div className="paths">
              <article className="path">
                <VoxelGameIcon size={36} />
                <h3>Para visitantes: a diversão vem primeiro</h3>
                <p>
                  Passeie pela vila e jogue no seu ritmo. Conforme as ONGs forem aprovadas e suas casinhas publicadas,
                  você também poderá descobrir histórias e projetos sociais durante a visita.
                </p>
                <p>Jogar é gratuito. Conhecer uma causa ou contribuir com ela será sempre uma escolha sua.</p>
                <a className="inline-cta" href={GAME_URL}>
                  Entrar na Vila
                  <VoxelArrowIcon />
                </a>
              </article>

              <article className="path">
                <VoxelChaletHeartIcon size={36} />
                <h3>Para ONGs: sua história merece um espaço próprio</h3>
                <p>
                  Sua organização poderá apresentar seu trabalho em uma casinha virtual dentro da Vila. Para se
                  candidatar, um responsável deverá criar uma conta de usuário comum e, com essa conta, preencher o
                  formulário de candidatura da ONG. A candidatura passará por análise documental antes de qualquer
                  publicação.
                </p>
                <a className="inline-cta" href="#como-candidatar">
                  Ver etapas e critérios da candidatura
                  <VoxelArrowIcon />
                </a>
              </article>
            </div>
          </div>
        </section>

        <section id="ongs" className="section section--tonal" aria-labelledby="ongs-title">
          <div className="section__inner">
            <div className="section__intro">
              <h2 id="ongs-title">O que uma casinha virtual pode oferecer à sua ONG</h2>
            </div>

            <div className="offer-list">
              <article className="offer">
                <VoxelPlazaIcon size={36} />
                <div>
                  <h3>Uma nova forma de ser encontrada</h3>
                  <p>
                    A Vila cria mais um ponto de contato entre sua organização e pessoas que talvez ainda não conheçam
                    seu trabalho. A descoberta acontece dentro de uma experiência que elas escolheram explorar.
                  </p>
                </div>
              </article>

              <article className="offer">
                <VoxelChaletHeartIcon size={36} />
                <div>
                  <h3>Espaço para apresentar o que vocês fazem</h3>
                  <p>
                    A casinha foi pensada para reunir a apresentação da ONG, seus projetos e conteúdos visuais
                    autorizados. Quem se interessar poderá entender melhor a causa e o trabalho por trás dela.
                  </p>
                </div>
              </article>

              <article className="offer">
                <VoxelMissionIcon size={36} />
                <div>
                  <h3>Motivos para o público voltar</h3>
                  <p>
                    Uma organização tem novas ações, histórias e necessidades ao longo do tempo. Queremos que a casinha
                    acompanhe esse movimento e abra oportunidades de interação com os visitantes. A forma de atualizar e
                    moderar os conteúdos ainda está sendo definida.
                  </p>
                </div>
              </article>

              <article className="offer">
                <VoxelClockIcon size={36} />
                <div>
                  <h3>Um futuro caminho de apoio</h3>
                  <p>
                    O projeto prevê a possibilidade de doações destinadas a ONGs identificadas. Essa função depende de
                    validações e acordos antes de ser disponibilizada. Nenhuma ONG deve contar com doações pela Vila
                    neste momento.
                  </p>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section id="como-candidatar" className="section" aria-labelledby="como-candidatar-title">
          <div className="section__inner">
            <div className="section__intro">
              <h2 id="como-candidatar-title">Como candidatar sua ONG</h2>
              <p className="section__lead">
                <strong>A candidatura começa com a conta de uma pessoa responsável pela organização.</strong>
              </p>
            </div>

            <ol className="steps">
              <li>
                <div>
                  <h3>Crie uma conta de usuário comum.</h3>
                  <p>O responsável cadastra seus dados de usuário para acessar a Vila.</p>
                </div>
              </li>
              <li>
                <div>
                  <h3>Acesse a candidatura com essa conta.</h3>
                  <p>
                    Depois de entrar, o responsável preenche o formulário da ONG com as informações da organização e os
                    documentos e comprovantes solicitados.
                  </p>
                </div>
              </li>
              <li>
                <div>
                  <h3>Envie a candidatura para análise documental.</h3>
                  <p>
                    A equipe responsável verifica as informações e os requisitos de seleção. Se necessário, poderá
                    solicitar ajustes.
                  </p>
                </div>
              </li>
              <li>
                <div>
                  <h3>Aguarde a decisão.</h3>
                  <p>
                    O envio não publica uma casinha. Somente uma ONG aprovada poderá ter sua casa apresentada na Vila e,
                    futuramente, acessar os recursos de doação associados a ela.
                  </p>
                </div>
              </li>
            </ol>

            <div className="apply-check">
              <div className="apply-criteria">
                <h3>Critérios de seleção já definidos</h3>
                <p>Para se candidatar, a organização deve atender aos três requisitos iniciais:</p>
                <ol className="criteria-list">
                  <li>
                    <VoxelCheckShieldIcon />
                    <strong>CNPJ ativo.</strong>
                  </li>
                  <li>
                    <VoxelCheckShieldIcon />
                    <strong>Pelo menos 1 ano de existência.</strong>
                  </li>
                  <li>
                    <VoxelCheckShieldIcon />
                    <strong>Um meio confiável de confirmar os valores destinados à organização.</strong>
                  </li>
                </ol>
              </div>

              <aside className="why" aria-labelledby="why-title">
                <h3 id="why-title">Por que essas exigências existem?</h3>
                <p>
                  Quem ajuda precisa saber que a casinha representa uma ONG real. O CNPJ ativo, o tempo mínimo de
                  existência e a análise documental ajudam a verificar a organização antes de sua aprovação. O meio
                  confiável de confirmação permite conferir os valores destinados a ela.
                </p>
                <p>
                  Esses cuidados protegem o caminho da doação: identificar quem recebe, confirmar o recebimento e
                  apresentar com clareza os projetos da ONG na Vila.{" "}
                  <strong>
                    Comprovar que os recursos foram efetivamente usados nesses projetos exige também prestação de contas
                    e evidências da aplicação dos valores.
                  </strong>{" "}
                  Essas regras ainda serão definidas; não afirmaremos que essa comprovação existe antes de poder
                  realizá-la.
                </p>
              </aside>
            </div>

            <div className="apply-footer">
              <p className="note apply-note">
                O cadastro e o formulário de candidatura ainda não estão abertos na versão pública. Esta página mostrará
                o caminho para iniciá-los assim que forem liberados.
              </p>
              <a className="inline-cta" href="#faq">
                Ver como funciona a candidatura
                <VoxelArrowIcon />
              </a>
            </div>
          </div>
        </section>

        <section id="visitantes" className="section section--tonal" aria-labelledby="visitantes-title">
          <div className="section__inner">
            <div className="section__intro">
              <h2 id="visitantes-title">Como funciona para quem visita</h2>
            </div>

            <ol className="visit-steps">
              <li>
                <h3>Entre, explore e brinque</h3>
                <p>
                  A Vila Noel do Bem é uma experiência natalina que funciona no navegador. Você pode passear pelo
                  cenário e jogar gratuitamente.
                </p>
              </li>
              <li>
                <h3>Encontre causas durante o passeio</h3>
                <p>
                  À medida que as casinhas de ONGs aprovadas forem publicadas, a exploração também será uma forma de
                  conhecer organizações e seus projetos.
                </p>
              </li>
              <li>
                <h3>Escolha se e como deseja ajudar</h3>
                <p>
                  A diversão não depende de uma doação. Quando os recursos de contribuição estiverem disponíveis, você
                  poderá decidir se quer apoiar uma causa, com o destino do pagamento informado antes de concluir
                  qualquer ação.
                </p>
              </li>
            </ol>

            <div className="actions">
              <a className="btn btn--primary" href={GAME_URL}>
                Explorar a Vila
              </a>
            </div>
          </div>
        </section>

        <section id="doacoes" className="section" aria-labelledby="doacoes-title">
          <div className="section__inner">
            <div className="donation-layout">
              <div className="section__intro">
                <h2 id="doacoes-title">Doações com destino claro</h2>
                <p className="donation-status">
                  <VoxelClockIcon />
                  <strong>As doações pela Vila ainda não estão disponíveis.</strong>
                </p>
              </div>
              <div className="donation-body">
                <p>
                  Quando forem ativadas, a proposta é mostrar com clareza quem receberá cada contribuição. Uma doação
                  ligada à casinha de uma ONG será destinada à organização identificada. A opção de doação geral terá um
                  parceiro responsável próprio; ela não será dividida automaticamente entre todas as ONGs.
                </p>
                <p>
                  Jogar, visitar uma casinha ou participar de uma atividade não gera uma doação automática.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section id="faq" className="section" aria-labelledby="faq-title">
          <div className="section__inner">
            <div className="section__intro">
              <h2 id="faq-title">Perguntas frequentes</h2>
            </div>

            <div className="faq">
              <div className="faq__item">
                <h3>Preciso doar para entrar ou jogar?</h3>
                <p>Não. A visita e os jogos disponíveis são gratuitos. Doar será uma escolha separada, quando essa função estiver ativa.</p>
              </div>
              <div className="faq__item">
                <h3>Preciso criar uma conta de ONG antes da candidatura?</h3>
                <p>
                  Não. Um responsável cria primeiro uma <strong>conta de usuário comum</strong>. Com ela, preenche e
                  envia o formulário de candidatura da ONG quando o cadastro estiver disponível.
                </p>
              </div>
              <div className="faq__item">
                <h3>Basta enviar o formulário para ganhar uma casinha?</h3>
                <p>Não. A candidatura passa por análise documental. A casinha só poderá ser publicada depois da aprovação.</p>
              </div>
              <div className="faq__item">
                <h3>Quais são os requisitos iniciais para a ONG?</h3>
                <p>CNPJ ativo, pelo menos um ano de existência e um meio confiável de confirmar os valores destinados à organização.</p>
              </div>
              <div className="faq__item">
                <h3>A ONG poderá atualizar sua casinha?</h3>
                <p>
                  Esse é o objetivo: permitir que o espaço acompanhe projetos e novidades da organização. O processo de
                  atualização e moderação ainda está em definição.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section id="proximo-passo" className="cta-banner" aria-labelledby="proximo-passo-title">
          <div className="cta-banner__inner">
            <h2 id="proximo-passo-title">Seu próximo passo</h2>
            <div className="next-steps">
              <div className="next-step">
                <p>
                  <strong>Quer descobrir a Vila?</strong> Entre, explore e divirta-se.
                </p>
                <a className="btn btn--primary btn--lg" href={GAME_URL}>
                  Explorar a Vila
                </a>
              </div>
              <div className="next-step">
                <p>
                  <strong>Representa uma ONG?</strong> Conheça os critérios e as etapas para preparar sua candidatura.
                </p>
                <a className="btn btn--secondary btn--lg" href="#como-candidatar">
                  Ver como candidatar minha ONG
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <VoxelVillageSkyline />
      <footer className="footer">
        <div className="footer__inner">
          <img className="footer__logo" src="/logo-vilanoeldobem.png" width={380} height={360} alt="" />
          <p className="footer__tagline">
            <strong>Vila Noel do Bem</strong> — Uma vila para brincar, descobrir causas e criar novas conexões.
          </p>
          <p>
            Contato: <a className="footer__contact" href="mailto:vilanoeldobem@gmail.com">vilanoeldobem@gmail.com</a>
          </p>
          <p className="footer__copy">© 2026 Vila Noel do Bem</p>
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
