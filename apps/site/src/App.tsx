import { GAME_URL } from "./config";

/**
 * Public landing page. Copy is pt-BR and uses only approved wording: purpose and promise
 * (DEC-021); donation rules (DEC-010..013, DEC-026, DEC-029); NGO criteria (DEC-015);
 * deadline (DEC-043). No slogan is used (PEN-015) and the final logo is not approved (DEC-024),
 * so the wordmark is a temporary placeholder.
 */
export function App() {
  return (
    <>
      <header className="top">
        <a className="wordmark" href="/" aria-label="Vila Noel do Bem — início">
          <span>VILA NOEL</span>
          <span>DO BEM</span>
        </a>
        <nav aria-label="Seções">
          <a href="#como-funciona">Como funciona</a>
          <a href="#doacoes">Doações</a>
          <a href="#ongs">Para ONGs</a>
          <a className="btn btn--small" href={GAME_URL}>
            Entrar na Vila
          </a>
        </nav>
      </header>

      <main>
        <section className="hero">
          <div className="hero__text">
            <p className="kicker">Vila natalina virtual em 3D</p>
            <h1>Um lugar para viver o Natal, compartilhar alegria e encontrar oportunidades de fazer o bem.</h1>
            <p className="lead">
              Explore uma vila em voxel art, jogue minijogos gratuitos e conheça organizações sociais — direto no
              navegador, no computador ou no celular.
            </p>
            <div className="actions">
              <a className="btn btn--primary" href={GAME_URL}>
                Entrar na Vila
              </a>
              <a className="btn" href="#como-funciona">
                Como funciona
              </a>
            </div>
          </div>
          <figure className="hero__shot">
            <img src="/img/praca.jpg" width="1440" height="900" alt="A praça da Vila em voxel: árvore de Natal ao centro, postes dourados, palmeiras e um avatar de gorro." />
            <figcaption>Prévia da praça · versão em desenvolvimento</figcaption>
          </figure>
        </section>

        <section id="como-funciona" className="section">
          <h2>Como funciona</h2>
          <div className="cards">
            <article className="card">
              <span className="card__icon" aria-hidden>🏡</span>
              <h3>Explorar</h3>
              <p>Ande pela praça, encontre presentes escondidos e visite os terrenos onde organizações sociais aprovadas abrem suas casas.</p>
            </article>
            <article className="card">
              <span className="card__icon" aria-hidden>🎲</span>
              <h3>Jogar</h3>
              <p>Minijogos simples e gratuitos. O Jogo da Memória já está disponível; outros chegam aos poucos. Jogar nunca é uma doação.</p>
            </article>
            <article className="card">
              <span className="card__icon" aria-hidden>★</span>
              <h3>Missões da Vila</h3>
              <p>Complete missões nas trilhas Explorar, Brincar e Conhecer causas para ganhar experiência e subir de nível — sem precisar doar.</p>
            </article>
          </div>
        </section>

        <section id="doacoes" className="section section--soft">
          <h2>Doação com transparência</h2>
          <div className="two-col">
            <div>
              <h3>Doação global</h3>
              <p>
                Na praça, você pode doar sem escolher uma ONG específica. O valor vai para <strong>uma única instituição
                parceira</strong>, independente, que decide a destinação conforme seus programas. A Vila não divide essas
                doações entre as ONGs.
              </p>
              <p className="note">Instituição parceira: a definir.</p>
            </div>
            <div>
              <h3>Doação para uma ONG</h3>
              <p>Dentro da casa de cada organização aprovada, você doa diretamente para ela. O destinatário aparece sempre antes de qualquer pagamento.</p>
              <p className="note">As doações serão habilitadas após a definição e o contrato da instituição parceira.</p>
            </div>
          </div>
        </section>

        <section id="ongs" className="section">
          <h2>Para organizações sociais</h2>
          <p className="lead">Os terrenos da Vila estão abertos para organizações que atendem a três critérios:</p>
          <ol className="criteria">
            <li>CNPJ ativo.</li>
            <li>Pelo menos 1 ano de existência.</li>
            <li>Um meio confiável de confirmar os valores destinados à organização.</li>
          </ol>
          <p>Toda candidatura passa por análise; só a aprovação publica a casa na Vila. O cadastro de ONGs abre em breve.</p>
        </section>

        <section className="section cta">
          <h2>A Vila já está acesa.</h2>
          <p>Ela cresce até o lançamento, previsto para 30 de novembro de 2026.</p>
          <a className="btn btn--primary" href={GAME_URL}>
            Entrar na Vila
          </a>
        </section>
      </main>

      <footer className="footer">
        <p>© 2026 Vila Noel do Bem</p>
        <p className="note">Transformar a magia do Natal em experiências que aproximam pessoas, despertam alegria e estimulam a solidariedade.</p>
      </footer>
    </>
  );
}
