/**
 * Areas the backoffice will need but that cannot exist yet, or that still wait for a product decision.
 * Placeholders on purpose: one honest paragraph each, no data, no button that pretends to work (AGENTS.md
 * product rules). Which areas come and how is for the product owner to decide (PROPOSTA of this list: IMPL-0015).
 */
import { Notice, PageHead } from "./common";

export function Pending() {
  return (
    <>
      <PageHead title="Pendentes" lead="Áreas que ainda não existem neste painel ou que dependem de uma decisão, e o que falta para cada uma. Aqui não há dados nem ações." />
      <Notice state="pending" title="Doações">
        <p>
          A Vila não processa nenhuma doação hoje. Esta área depende da definição e do contrato da instituição parceira (PEN-004) e do provedor de
          pagamento (PEN-006); até lá os botões de doação do jogo ficam desabilitados (IMPL-0002). Não há valores, doadores nem repasses para
          mostrar.
        </p>
      </Notice>
      <Notice state="pending" title="Indicadores">
        <p>
          Um indicador público só aparece com fonte verificável (DEC-027); sem fonte, o jogo mostra “—”. Como cada indicador será apurado e
          conferido por aqui ainda não foi definido, então este painel não edita nem publica números.
        </p>
      </Notice>
      <Notice state="pending" title="Documentos e logos das ONGs">
        <p>
          O envio de logo e de documentos na candidatura existe atrás de uma bandeira (<code>NGO_FILES_ENABLED</code>, PROPOSTA: IMPL-0017),
          desligada em produção; o estado dela aparece em Sistema. Com o envio ligado, os arquivos são conferidos dentro de cada candidatura,
          em Candidaturas. Seguem pendentes duas decisões do dono do produto: quais documentos uma ONG deve enviar (PEN-019) e por quanto tempo
          os arquivos ficam guardados (OQ-12). Até lá o envio é opcional e nenhum documento é exigido.
        </p>
      </Notice>
    </>
  );
}
