# IMPL-0021: Papel de administrador e moderação

**Status:** Aceita pelo responsável técnico (2026-11-12) para os dois papéis, o login próprio do painel, a gestão
de papéis pelo painel e a exceção de moderação dentro do jogo. **Proposta — implementada, desligada em produção e
homologação** para o bloqueio de conta (`ACCOUNT_BLOCK_ENABLED`; política PENDENTE,
[OQ-11](open-questions.md)) e para a remoção de visitante de uma sala (`PRESENCE_MODERATION_ENABLED`)
**Data:** 2026-11-12
**Fontes:** contrato de moderação decidido pelo responsável técnico em 2026-11-12; DEC-037 do
[registro de produto](https://github.com/vilanoeldobem/docs/blob/main/docs/decisions/registro-de-decisoes.md);
[IMPL-0008](0008-multiplayer-presence-durable-objects.md) (presença anônima),
[IMPL-0011](0011-accounts-magic-link-ngo-review.md) (contas), [IMPL-0015](0015-dash-backoffice-app.md) (painel),
[IMPL-0017](0017-ngo-files-r2.md) (arquivos), [IMPL-0020](0020-ngo-publication-withdrawal.md) (convenções de
bandeira, batch e schema); OQ-10 (resolvida) e OQ-11 (aberta). Código desta entrega:
`apps/api/src/{account-moderation,presence-moderation,session,auth,files}.ts`,
`migrations/0010_account_blocks.sql`, `packages/shared/src/accounts/{contract,moderation,errors}.ts`

## Contexto

O papel `admin` só podia ser concedido por um comando no banco, e a IMPL-0015 deixou a seção de contas do painel
só para leitura: "sem ação de sanção (regras não definidas, DEC-037)". Faltavam três coisas para operar a Vila com
contas ligadas: administrar quem é administrador sem acesso ao banco, tirar do ar um logo já publicado, e agir
sobre uma conta ou um visitante que atrapalha os outros.

Duas restrições vêm de decisões anteriores e não mudam aqui:

- **A presença é anônima** (IMPL-0008): um id numérico por conexão, sem conta, sem nome, sem texto livre. O
  servidor de tempo real não sabe quem é ninguém.
- **Menores são público provável** (ECA Digital, LGPD): coleta mínima, só o nickname é público, e nenhuma sanção
  pode tirar da pessoa o direito de saber o motivo e de excluir a própria conta.

**O que é sanção, quem a aplica, por quanto tempo, com que recurso e com que aviso é decisão do dono do produto
(DEC-037, OQ-11) e não está tomada.** Este ADR registra as decisões técnicas do responsável técnico e um
**mecanismo** revisável para o bloqueio; nada aqui decide a política nem autoriza ligar bandeira, aplicar migration
remota ou publicar.

A API pode ser publicada com todas as bandeiras desligadas sobre um banco atrás do código (produção está no schema
v3): as rotas públicas sempre ligadas não podem depender de tabela nova.

## Decisão

### 1. Dois papéis

Padrão (`player` no código e no banco) e Administrador (`admin`). Os valores guardados **não mudam de nome**; a
interface mostra "Padrão" e "Administrador" (`ROLE_LABEL` em `packages/shared/src/accounts/contract.ts`). Não há
papel intermediário (moderador, revisor): quem modera é administrador.

### 2. O painel mantém o login próprio da aplicação

`dash.vilanoeldobem.com.br` continua entrando pelo link mágico e pela sessão da API (IMPL-0015, OQ-10): **sem
Cloudflare Access na frente**. Só um administrador vê o painel; a API confere o papel em cada rota `/admin/*`.

### 3. Exceção estreita à regra da IMPL-0015, dentro do jogo

A regra "a interface de administração vive só em `apps/dash`, nunca no jogo" ganha uma exceção deliberada e
estreita: **o jogo pode mostrar *ações* de moderação a um administrador conectado; listas, filas de análise e
auditoria ficam no painel.** As ações previstas no jogo são as desta entrega (remover um visitante da sala) e as
que já existem na API e já são auditadas, mostradas sobre a casa de uma ONG: retirar a ONG
(`NGO_WITHDRAWAL_ENABLED`), remover uma foto da galeria (`NGO_PHOTOS_ENABLED`) e remover um logo publicado (item
6), mais o link "Abrir no painel" para a análise completa. A API continua sendo a única proteção: o que o jogo
esconde é conveniência.

### 4. Papéis concedidos e retirados pelo painel

`POST /admin/users/:id/role {accountId, role}`, só para administradores, auditado (`user.role_change`, assunto
`user:<id>`, detalhe `{from, to}`). Sem bandeira própria (vale com `ACCOUNTS_ENABLED`).

- **O primeiro administrador continua sendo criado pelo comando documentado no banco**
  ([deploy §7.4](../guides/deploy.md#74-conceder-o-papel-de-administrador)).
- Ninguém muda o próprio papel (`403 self_role`); conta bloqueada não é promovida (`409 account_blocked`); pedir o
  papel que a conta já tem responde `200` sem auditoria.
- **Um batch, duas conferências no SQL:** a conta-alvo ainda está no estado lido, e quem pede **ainda é
  administrador** quando o batch confirma. Como quem pede é um administrador diferente do alvo, um rebaixamento
  nunca remove o último administrador: se os dois últimos se rebaixam ao mesmo tempo, exatamente um vence e o
  outro recebe `409 last_admin`. Só a requisição vencedora grava a auditoria (`users.moderation_token`).
- O rebaixamento não revoga mais nada: a sessão continua, e a próxima requisição administrativa responde
  `403 admin_only`.

### 5. Bloqueio de conta — PROPOSTA, atrás de `ACCOUNT_BLOCK_ENABLED`

Mecanismo apenas; **fica desligado até a OQ-11 ser respondida**. `"false"` em produção e homologação, `true` no
script local `dev`.

1. **Registro aditivo.** A migration `0010_account_blocks.sql` cria `account_blocks` (quem bloqueou, quando, a
   mensagem para a pessoa, quando e por quem foi desfeito; no máximo um bloqueio em vigor por conta) e a coluna
   `users.blocked`, que a conferência de sessão lê.
2. **Rotas.** `POST /admin/users/:id/block {accountId, message}` e `POST /admin/users/:id/unblock {accountId}`.
   Recusam: a própria conta (`403 self_block`), a conta de um administrador (`409 admin_account`: rebaixar
   antes), conta já bloqueada ou não bloqueada (`409 bad_transition`). Mesmo batch com duas conferências do item 4.
   Auditoria `user.block` / `user.unblock`, assunto `user:<id>`, detalhe com o id do registro, **nunca o texto**.
3. **O texto é uma mensagem para a pessoa.** O `message` (10 a 1000 caracteres) é entregue como foi escrito à
   pessoa bloqueada. A validação, a documentação e os tipos dizem isso; não existe anotação interna.
4. **Regra da sessão (a menor regra coerente):** o bloqueio encerra todas as sessões da conta. Dali em diante, o
   link de acesso continua funcionando, **com as mesmas respostas de qualquer e-mail**, e abre uma **sessão
   restrita** que só faz três coisas: ler `GET /me` (com `blocked: {message, at}`), sair e excluir a conta
   (`DELETE /me`). Toda outra rota com sessão responde `403 session_blocked`. A conferência é feita a cada
   requisição, em `requireUser`.
   - É assim que a pessoa lê o motivo **sem revelar nada a terceiros**: as rotas de link não têm ramo para conta
     bloqueada (mesmo código, mesma resposta, mesmo e-mail); o motivo só aparece depois que a pessoa prova que o
     e-mail é dela.
   - É assim que a **exclusão nunca é tirada**: o caminho documentado de exclusão (`DELETE /me`) continua
     funcionando para a conta bloqueada, pelo fluxo normal do link.
5. **Escritas em andamento são recusadas no SQL.** Candidatura e reenvio, gravação de progresso e a confirmação de
   um envio de logo, documento ou foto conferem `users.blocked` no próprio batch: o que estava a caminho quando o
   bloqueio foi gravado não é guardado.
6. **Exclusão de uma conta bloqueada.** Apaga a conta e, em cascata, o registro do bloqueio (a mensagem é texto
   sobre a pessoa). A auditoria guarda os ids. **Nada guarda o e-mail depois da exclusão**: guardar o e-mail (ou um
   hash) de quem foi bloqueado para impedir novo cadastro é retenção de dado pessoal depois da exclusão, e isso só
   o dono do produto decide (OQ-11). Enquanto a conta existe, cadastrar o mesmo e-mail não cria nada, e um cadastro
   bloqueado que nunca confirmou o link não expira em 24 horas.
7. **Bandeira.** Controla só **novos** bloqueios; um bloqueio gravado continua valendo com ela desligada (mesma
   convenção de `NGO_WITHDRAWAL_ENABLED`). **Desfazer um bloqueio não depende da bandeira**: desligá-la nunca
   pode deixar alguém bloqueado sem saída.
8. **Schema.** Como a conferência de sessão lê `users.blocked`, toda rota com sessão responde
   `503 schema_outdated` num banco sem a 0010 (nunca `500`, nunca uma conferência mais fraca). Nenhuma rota
   pública lê o que a 0010 cria; elas respondem igual nos schemas v3 a v10, com qualquer combinação de bandeiras.

### 6. Remoção de logo por administrador

`POST /admin/ngos/:id/logo/remove {accountId, revision}`: apaga a linha e o objeto do logo com as mesmas guardas da
remoção feita pelo responsável (revisão em tela, token da operação, revisão incrementada, auditoria
`ngo.logo_remove`), **em qualquer estado**. Um logo publicado é público, então a administração precisa poder
tirá-lo do ar. Exige o bucket (`503` sem ele), não a bandeira de envio. Ninguém age como administração sobre a
própria organização: o administrador responsável pela ONG recebe `403 self_review`, como nas outras ações
administrativas.

### 7. Remover um visitante de uma sala — PROPOSTA, atrás de `PRESENCE_MODERATION_ENABLED`

`"false"` em produção e homologação, na API **e** no servidor de tempo real; `true` no script local `dev`.

A presença continua anônima e **o servidor de tempo real nunca fica sabendo quem é ninguém, nem o administrador**:

1. O jogo do administrador pede à API um **bilhete de uso único** (`POST /admin/moderation/ticket {accountId, room,
   target}`): 32 caracteres URL-safe (192 bits aleatórios), guardado como SHA-256, 30 segundos de validade, preso
   àquele administrador, àquela sala e àquele alvo (o id da conexão). No máximo 10 por administrador por minuto.
   Sem auditoria ainda: nada aconteceu.
2. O jogo envia `["m", target, ticket]` na conexão aberta.
3. A sala confere o formato, que o alvo está conectado e não é quem enviou, e devolve o bilhete à API por um
   **binding de serviço** (`env.API`, serviço `vilanoeldobem-api`; sem segredo compartilhado):
   `POST /moderation/consume {ticket, room, target}`. A API marca o bilhete como usado e grava a auditoria
   (`presence.remove`, assunto `room:<n>`, detalhe `{target}`) no mesmo batch, só para a requisição vencedora, e só
   se quem pediu ainda é administrador e não está bloqueado.
4. Só com `200` e o corpo exato `{"ok":true}` a sala fecha a conexão do alvo (código `4003`); em qualquer outro
   caso, inclusive binding ausente ou falha na chamada, não fecha ninguém (falha fechada). A sala nunca guarda o
   bilhete nem o resultado.
5. O cliente removido mostra uma mensagem honesta e não reconecta sozinho por 60 segundos.

`POST /moderation/consume` não tem sessão nem conferência de `Origin` (o bilhete é a credencial; a chamada chega
pelo binding sem `Origin` e sem endereço de cliente), não envia nenhum cabeçalho CORS (uma página não consegue
chamá-la) e tem limite de requisições próprio: por endereço para quem chama pelo domínio público, **por sala** para
as chamadas do binding, que não têm endereço. Tudo o que não é um bilhete válido recebe o mesmo `404`. A validade
do bilhete é a constante compartilhada `MODERATION_TICKET_TTL_MS` (`packages/shared/src/accounts/moderation.ts`),
da qual o servidor de tempo real também depende.

**Limites do anonimato (aceitos nesta proposta):**

- **É uma cortesia, não um banimento.** Um visitante anônimo pode voltar na hora por outra conexão; a espera de 60
  segundos é do cliente honesto, não uma barreira. Bloquear contas é o item 5, e a presença não tem conta.
- **O administrador age sobre um id de conexão**, não sobre uma pessoa: nada liga o alvo a uma conta, nem para a
  API, nem para a auditoria. A auditoria diz qual administrador removeu qual conexão de qual sala, e só.
- **Nada impede o visitante removido de entrar em outra sala.**
- **`presence.remove` registra que a remoção foi autorizada, não que uma conexão foi fechada.** A API não sabe se
  o alvo existia nem se a sala de fato fechou a conexão; se o alvo sai durante a chamada, o bilhete foi consumido
  e a auditoria gravada, mas a sala responde ao administrador que não removeu.

## Alternativas consideradas

- **Cloudflare Access na frente do painel:** já recusado na OQ-10; o painel usa a sessão da aplicação.
- **Um terceiro papel (moderador):** mais um conjunto de permissões para manter e auditar sem necessidade
  demonstrada. Não adotado; pode voltar quando a OQ-11 definir quem aplica sanções.
- **Conta bloqueada sem sessão nenhuma** (o link responderia `403` com o motivo e não abriria sessão): cumpre "não
  entra", mas tira o caminho documentado de exclusão (`DELETE /me` exige sessão) ou exige uma segunda credencial
  só para excluir. A sessão restrita é menor e deixa as duas garantias (ler o motivo, excluir) num só lugar.
- **Dizer no pedido de link que o e-mail está bloqueado:** revelaria a um terceiro que aquele e-mail tem conta e
  está bloqueado (enumeração). Recusada.
- **Guardar o e-mail (ou um hash) depois da exclusão para impedir novo cadastro:** retenção de dado pessoal depois
  da exclusão; decisão de produto e de LGPD, não de código (OQ-11).
- **Conferir o bloqueio só na entrada da requisição:** uma candidatura ou um envio em andamento passaria. Por isso
  as escritas conferem de novo no SQL.
- **Conferir só "resta outro administrador" no rebaixamento, sem conferir quem pede:** um administrador rebaixado
  um instante antes ainda concluiria uma mudança de papel. Conferir quem pede cobre os dois casos.
- **Segredo compartilhado entre o servidor de tempo real e a API:** mais um segredo para guardar e trocar. O
  binding de serviço dispensa segredo, e o bilhete já é a credencial.
- **A sala conhecer a sessão do administrador** (cookie ou token no WebSocket): quebraria a presença anônima
  (IMPL-0008) e levaria identidade para o Durable Object.
- **Banir por IP ou por impressão do navegador:** guardaria um identificador de pessoas (possivelmente menores)
  que a Vila hoje não guarda; fora do escopo e da coleta mínima.

## Consequências

- **Migration antes da API, com as contas ligadas.** Com a 0010 ausente, ninguém usa a sessão
  ([deploy §10](../guides/deploy.md#10-administrador-e-moderação-impl-0021)). Com as contas desligadas (produção
  hoje), a ordem não importa.
- **Depois de existir algum bloqueio, reverter a API para uma versão anterior não é seguro:** ela não lê
  `users.blocked`.
- **O bloqueio é da conta, não da pessoa.** Excluir a conta libera o e-mail; criar outra conta com outro e-mail
  sempre foi possível. Isso não equivale a um banimento, e a OQ-11 precisa dizer se deve.
- **Sem prazo, sem recurso, sem aviso por e-mail:** o bloqueio vale até um administrador desfazê-lo, e a pessoa só
  descobre ao tentar entrar. São perguntas da OQ-11, não decisões.
- **A candidatura e a ONG de uma conta bloqueada não mudam:** uma ONG publicada continua publicada, e a
  administração ainda pode decidir uma candidatura em aberto. Tirar a ONG da Vila é a retirada (IMPL-0020).
- **O último administrador ainda pode excluir a própria conta** (a exclusão é um direito e não é barrada): o
  comando do banco volta a ser o caminho para criar um administrador.
- **`last_admin` só aparece em disputa:** sozinho, um administrador não consegue rebaixar o último (ele mesmo:
  `403 self_role`).
- A rota `POST /moderation/consume` também responde no domínio público da API (toda rota responde); o bilhete de
  192 bits, o `404` único e o limite de requisições são a proteção.
- **Entregue em conjunto:** a API e o contrato compartilhado, a mensagem `["m", …]` na sala com o binding de serviço
  no servidor de tempo real, e as telas do painel (papéis, bloqueio, remoção de logo, link para uma candidatura) e
  do jogo (modo moderação, ações na casa da ONG, remoção de visitante, conta bloqueada). O painel passou a usar o
  rótulo compartilhado "Padrão" para `player`.
- Validação com testes sobre SQLite real e com o ciclo local em workerd/D1/R2. Nenhum deploy, migration remota,
  mudança de segredo ou ativação é autorizado por este ADR.

## Relacionados

[API: papéis, bloqueio, bilhete e remoção de logo](../reference/api.md#papéis-impl-0021) ·
[Armazenamento](../reference/storage.md#account_blocks-v10-proposta) ·
[Deploy](../guides/deploy.md#10-administrador-e-moderação-impl-0021) · [OQ-11](open-questions.md) ·
[Painel](0015-dash-backoffice-app.md) · [Presença](0008-multiplayer-presence-durable-objects.md) ·
[Retirada de ONG](0020-ngo-publication-withdrawal.md).
