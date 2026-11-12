/**
 * Areas the backoffice will need but that cannot exist yet. Placeholders on purpose: one honest paragraph each,
 * no data, no button that pretends to work (AGENTS.md product rules). Which areas come and how is for the
 * product owner to decide (PROPOSTA of this list: IMPL-0015).
 */
import { Notice, PageHead } from "./common";

export function Pending() {
  return (
    <>
      <PageHead title="Pendentes" lead="Áreas que ainda não existem neste painel, e o que falta para cada uma. Nenhuma delas tem dados ou ações." />
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
          A candidatura ainda não recebe arquivos: os documentos são declarados e pedidos pela administração durante a análise. O armazenamento de
          arquivos não foi provisionado (o R2 não está habilitado na conta Cloudflare) e a lista de documentos exigidos segue pendente (PEN-019).
        </p>
      </Notice>
    </>
  );
}
