# O que a Vila consegue contar

**N5.1 da #65 · 20/11/2026 · revisão técnica para Augusto.** A primeira métrica proposta para a N5.2 é a **quantidade de doações globais confirmadas**. O D1 já distingue o Pix dirigido à parceira global do Pix dirigido a uma ONG. A consulta pública existente soma ambos. O recorte global precisa de uma consulta e de um rótulo próprios. As quatro perguntas sobre público e uso do jogo ainda exigem definições ou coleta. [Pedido da #65](https://github.com/vilanoeldobem/project/issues/65) · [Categorias e marcos da #66](https://github.com/vilanoeldobem/project/issues/66)

## O que aparece em produção

Na [main 2c29476](https://github.com/vilanoeldobem/project/tree/2c294767aa7756ceaf759eadb4799b7175dedc73), o Worker da API atende `GET /indicators` em `handleApi` e calcula o resultado em `indicators(env)`. A publicação 0.7.0 registra D1 v15. A checagem remota desta investigação foi feita pelas duas rotas públicas. Os registros financeiros de produção não foram consultados diretamente. [Implementação da API][api] · [Registro da publicação][release]

Em 20/11, às **09h33 de Brasília**, `GET /indicators` respondeu HTTP 200, com `updatedAt = 2026-11-20T12:33:15.338Z` e cache público de 30 s. `approved_ngos = 0` é um zero medido: a consulta procura ONGs publicadas vinculadas a um terreno publicado. `registered_users`, `confirmed_donations`, `confirmed_amount` e `people_impacted` vieram com `value: null`. A configuração retornou `accounts: false`, `quests: false` e `donations: false`. Nenhuma chave de visitantes, visitas, minijogos ou doações exclusivamente globais veio na resposta. [Indicadores ao vivo](https://api.vilanoeldobem.com.br/indicators) · [Configuração ao vivo](https://api.vilanoeldobem.com.br/config)

No painel P02, uma chave presente com valor numérico gera um cartão, inclusive para zero. `null` mostra **—** com a nota da API. Uma chave ausente não gera cartão. Se a requisição inteira falha, aparece “Indicadores indisponíveis no momento.” O painel mostra fonte e período da doação como “A definir”. Formata todos os números com `toLocaleString("pt-BR")`: 1.000 centavos aparecem como “1.000”, embora correspondam a R$ 10,00. `updatedAt` é o instante da resposta da API. [Painel P02][ui] · [Leitura HTTP pelo jogo][http]

O cartão de valor converte os centavos de `confirmed_amount` em reais. Por exemplo, 1.725 centavos aparecem como R$ 17,25. A data mostrada é a da consulta ao painel.

Em uma consulta bem-sucedida, o P02 informa em uma só nota quais medições de uso faltam na resposta. O cliente reconhece as chaves `unique_visitors`, `visits_by_ngo_house` e `players_by_minigame` para esse aviso. Uma chave presente conserva o cartão e o valor recebidos, inclusive zero ou `null` com motivo. Quando falta a série de visitantes, o painel explica que duas abas da mesma pessoa podem abrir duas conexões na praça. A definição das unidades, do período e da coleta segue em aberto.

## Dicionário de público e uso do jogo

| Indicador da #65 | Fonte hoje e unidade observável | Granularidade, identidade e janela | Repetição, abas e reconexão | Zero, indisponibilidade e coleta que falta |
|---|---|---|---|---|
| Simultâneos | O Durable Object mede conexões WebSocket aceitas por sala com `RoomState.size`. O HUD online mostra os outros avatares conhecidos na sala mais o próprio. | Uma conexão por ID efêmero na sala, no instante da observação. Até 8 salas de 40 vagas. Quem joga com “Outros visitantes” desligado fica fora. | Duas abas conectadas abrem dois sockets. Reconectar cria outro vínculo. Se o antigo ainda estiver ativo, há sobreposição até sua remoção. A sala encerra conexões inativas após 300 s na configuração atual. O cliente pausa a aba oculta após 120 s. | Uma sala observada vazia tem 0 conexões. Não há leitura de ocupação de toda a Vila em `/indicators`. Para conexões, agregar as salas com horário e cobertura da leitura. Para pessoas, Augusto precisa definir quem entra e como identificar duplicatas. Falha em uma sala torna o total incerto. [Sala][room] · [Servidor][do] · [Cliente][net] · [HUD][hud] |
| Visitantes históricos | Não há registro persistente de entrada de cada visitante da Vila no D1. `users` identifica contas, `sessions` registra sessões autenticadas, e o ID de sala expira. O GTM instalado e a medição parcial documentada em OQ-13 não fornecem ao painel uma série validada. | Unidade pretendida: visitante distinto desde uma data de início conhecida. A chave para visitante anônimo, navegador ou conta e a retenção estão em aberto. | A mesma pessoa pode retornar, trocar de aparelho, abrir abas ou se autenticar depois. Contar conexões ou logins incorpora essas repetições. | Chave ausente. Sem cobertura verificável, histórico indisponível. Aprovar identidade, início e retenção. Registrar a entrada com essa chave ou validar uma série existente com a mesma cobertura. Zero só faz sentido num período integralmente medido. [D1 de contas e eventos][accounts] · [OQ-13][oq] |
| Visitas por casa de ONG | Abrir o painel de um terreno chama `record("causes-visit-lot", lotId)`, salvo terreno marcado como não listado. O painel também pode ser de terreno vazio. A quest `newest-house-visit` exige casa publicada e quest ativa. | A fonte atual mede progresso por conta/missão/terreno ou progresso local do visitante. O indicador pedido precisa da casa/ONG na data da visita, de uma janela e de uma unidade: entrada ou visitante distinto. | A missão tem alvo 1. Depois do primeiro terreno, o cliente normal descarta inclusive visitas a outros terrenos. Reabrir a casa, reenviar o mesmo progresso ou reconectar não produz um histórico de entradas. | Chave ausente. Zero linhas de progresso não prova zero visitas. Após Augusto validar o vínculo histórico terreno–ONG, Pedro deve emitir uma ocorrência por entrada acordada com identificador reaproveitado no reenvio. Fixar quando uma reentrada conta. [Painel do terreno][lot] · [Missões][missions] · [Gravação no cliente][store] |
| Jogadores por minijogo | O catálogo oferece `memory`. “Jogar” abre o painel. A vitória gera `play-memory:win` e, com a quest aplicável ativa, também `memory-win`. Reiniciar a rodada é local. | A fonte atual permite identificar a primeira vitória sincronizada de uma conta. A métrica pedida exige jogador distinto por jogo e período, inclusive quem jogou sem vencer se esse for o critério. | Abandonar antes de vencer deixa zero vitórias. Novas vitórias esbarram na missão já concluída. Somar missões e quests pode duplicar a mesma vitória. Outra aba ou reconexão não identifica uma nova partida. | Chave ausente. Sem evento de início, zero vitórias não prova zero jogadores. Pedro define o ponto de início, o ID do jogo e o tratamento de retomada. Se a unidade for jogador, deduplicar por identidade e jogo na janela. Para partidas, identificar cada rodada. [Catálogo][games] · [Memória][memory] · [Progresso na API][progress] |

O D1 impõe chave primária `(user_id, mission_id, event_id)`. A API aceita eventos conhecidos, exige sessão para gravar e protege gravações concorrentes. O jogo guarda o progresso do visitante no navegador e pode enviá-lo ao autenticar. Assim, `progress_events.created_at` data a gravação, que pode ocorrer depois da visita. A API valida IDs e transições de quest, mas não observa a cena 3D. O evento local de missão concluída, os marcos da #66 e a leitura do painel `causes-global-donation:panel` têm finalidade de progresso. [Schema][accounts] · [Gravação e replay][progress] · [Sincronização][sync] · [Missões][missions]

## Dicionário financeiro

**Regra da consulta vigente.** Cada linha de `donations` representa uma doação registrada. Os agregados incluem as linhas cujo **estado atual** é `paid`, sem limite de data. `amount_cents` é o valor bruto em centavos de real. A dimensão do destino vem de `target_kind`; a rota global tem uma parceira configurada. A janela mede o saldo de confirmações vigentes desde o início da base e pode diminuir após disputa ou estorno. [Schema de doações][schema] · [Resolução de destino e transições][money]

| Indicador | Fonte, unidade e dimensão | Janela e regra de repetição | Zero ou indisponibilidade hoje |
|---|---|---|---|
| Quantidade global | Calculável no D1: `COUNT(*)` das linhas `paid` com `target_kind='global'`. Unidade: uma doação à parceira global. | Acumulado no estado atual. Uma linha por cobrança Pix, ainda que a confirmação se repita. | Sem chave específica em `/indicators`. Consulta habilitada e legível sem linhas elegíveis → 0. Sem fonte → propor `null` com motivo. |
| Valor global | Mesmo recorte global, `COALESCE(SUM(amount_cents),0)`. Unidade: centavos brutos. | Acumulado no estado atual. Somar cada cobrança uma vez, antes da divisão. | Sem chave específica. Fonte legível sem doações globais pagas → 0 centavos. Sem fonte → propor `null`. |
| Quantidade por ONG | `GET /ngos/:id/donation-info`, campo `confirmedDonations`. `COUNT(*)` com `ngo_id=? AND status='paid'`. Unidade: uma doação registrada para a ONG consultada. | Acumulado no estado atual por ID da ONG. Um Pix por cobrança. Inclui prova externa validada pelo administrador. | Sucesso sem linhas → 0. Rota desligada ou ONG sem publicação em terreno publicado → HTTP 404. Sem D1 ou schema requerido → 503. Sem cartão por ONG em P02. |
| Valor por ONG | Mesma rota e filtro, campo `confirmedAmountCents`. Soma bruta em centavos da ONG consultada. | Acumulado no estado atual. Cada linha `paid` entra uma vez, inclusive prova externa registrada. A parcela destinada à ONG está em campo separado. | Sucesso sem linhas → 0 centavos. Restrição da rota → 404 ou 503 conforme acima. |
| Quantidade total | `GET /indicators` → `confirmed_donations`. `COUNT(*)` de todas as linhas `paid`. Unidade: uma doação por registro, global ou dirigida. | Acumulado no estado atual. Inclui todas as destinações, mesmo que a casa já tenha saído do mapa. Deduplicação do Pix por cobrança. | Fonte legível sem linhas → 0. Bandeira desligada, sem binding D1 ou sem tabela de doações → `null`/—. Erro inesperado pode falhar a requisição inteira. |
| Valor total | `GET /indicators` → `confirmed_amount`. `COALESCE(SUM(amount_cents),0)` de todas as linhas `paid`. Unidade: centavos brutos em todos os destinos. | Acumulado no estado atual, uma soma por linha elegível. O total inclui o global uma única vez. | Fonte legível sem linhas → 0 centavos. Mesmas condições de `null`/— e falha integral da quantidade total. |

As duas últimas linhas usam todo o conjunto de doações. Somar apenas as ONGs que o mapa publica hoje pode omitir casas retiradas. A lista administrativa de doações recentes tem limite de 50 registros e também não serve de total. [Consulta pública][api] · [Consulta por ONG e visão administrativa][money]

**O que entra na soma.** O Pix usa uma chave de idempotência por intenção, uma cobrança identificada pelo provedor e um ID por evento recebido. As transições atualizam a doação existente. `under_dispute` e `refunded` saem da contagem, e uma disputa ganha pode restaurar `paid`. Uma intenção pendente, um clique em link próprio, uma compra de skin e o crédito de Título não são fontes do agregado. Uma prova externa conferida e registrada como `paid` entra no valor e na quantidade da ONG e da Vila, mesmo com `title_credited=0`. O cadastro manual não garante unicidade por comprovante, portanto a repetição manual pode inflar os agregados por ONG e total. As consultas atuais também não filtram `dev_mode`; confirmar isolamento do ambiente ou exclusão de testes antes de publicar números reais. [Criação e conciliação][money] · [Intenções e eventos pendentes][intents] · [Teste da confirmação][moneytest] · [Teste da prova externa][proof]

## FIN-01 · Conferir uma cobrança dirigida no D1 local

O diagnóstico compara cada linha normalizada do extrato de teste com uma doação da AbacatePay pelo ID da cobrança (`provider_charge_id`). Confere o destino (tipo, ONG e subconta gravados na cobrança), o bruto, a parcela da ONG, a parcela da Vila e o estado atual. Cada campo divergente gera uma linha. O sinal de `delta_cents` segue **extrato menos D1**, em centavos inteiros. O ensaio usa apenas dados fictícios e serve de preparação para a conferência de liquidação com o provedor em FIN-02.

Na raiz do projeto, com as dependências instaladas, execute o ensaio em um banco local descartável:

```sh
cd apps/api
mkdir -p .wrangler
state=$(mktemp -d .wrangler/fin01.XXXXXX)
pnpm exec wrangler d1 migrations apply ngo-media-review-local --local -c wrangler.reconciliation-local.jsonc --persist-to "$state" &&
  pnpm exec wrangler d1 execute ngo-media-review-local --local -c wrangler.reconciliation-local.jsonc --persist-to "$state" --file test/fixtures/pix-statement.sql &&
  pnpm exec wrangler d1 execute ngo-media-review-local --local -c wrangler.reconciliation-local.jsonc --persist-to "$state" --file scripts/reconcile-pix-statement.sql
```

| Cobrança fictícia | Resultado esperado | Leitura |
|---|---|---|
| `pix_fin01_match` | `match` | Destino, valores e estado coincidem. |
| `pix_fin01_cent` | `difference` em `ngo_share_cents` | O extrato traz 899 e o D1 traz 900. A diferença é −1 centavo. |
| `pix_fin01_missing` | `missing_in_d1` | A linha do extrato não encontrou uma cobrança Pix com esse ID. |
| `pix_fin01_duplicate` | `ambiguous_statement` | O extrato trouxe duas linhas para a mesma cobrança. É preciso identificar a linha correta antes de comparar valores. |

A [fixture de D1](../../apps/api/test/fixtures/pix-statement.sql) permite reproduzir esses quatro resultados. Na consulta de exemplo, um ID vazio recebe `missing_charge_id`. Uma falha de leitura ou de schema interrompe o comando.

### Conferir as linhas de um extrato normalizado

Para conferir uma amostra ou um arquivo diferente da fixture, salve localmente um JSON em UTF-8 e informe o diretório de estado usado no `wrangler d1 ... --persist-to`. Use uma linha por cobrança e dados do mesmo ambiente. `devMode: true` seleciona a sandbox no D1 local. O exemplo usa a primeira cobrança da fixture anterior.

```json
{
  "devMode": true,
  "rows": [
    {
      "charge_id": "pix_fin01_match",
      "target_kind": "ngo",
      "ngo_id": "ngo-fin01",
      "sub_account_id": "sacc_fin01",
      "amount_cents": 1000,
      "ngo_share_cents": 900,
      "vila_share_cents": 100,
      "status": "paid"
    }
  ]
}
```

Preencha os oito campos com os valores da fonte de conferência. Para uma doação global, use `target_kind: "global"`, `ngo_id: null` e a subconta da parceira. As três quantias são inteiros em centavos. Os estados aceitos são `pending`, `paid`, `refunded`, `under_dispute`, `expired` e `cancelled`. Separe as linhas cuja fonte ainda não informa o destino, o split ou o estado. Consulte o titular antes de atribuir esses valores.

```sh
node apps/api/scripts/check-pix-statement-fields.mjs /caminho/linhas.json /caminho/estado-wrangler
```

O [verificador](../../apps/api/scripts/check-pix-statement-fields.mjs) compara exclusivamente as cobranças listadas (`coverage: "listed_rows"`) com os Pix do ambiente escolhido. A posição `row` começa em 1. `difference` indica o campo divergente e, para quantias, a diferença em centavos (extrato menos D1). `missing_in_environment` indica que a cobrança está ausente nesse recorte. O relatório omite identificadores e valores brutos. O código de saída é 0 quando todas as linhas conferem, 1 quando há divergências e 2 quando o arquivo ou a leitura do banco falha. Lista vazia, ID duplicado, campo obrigatório ausente e centavos inválidos interrompem a conferência. Para atestar o crédito efetivo, a fonte deve identificar o lançamento da beneficiária.

### Extrato completo: conferir os identificadores nos dois sentidos

Use esta conferência quando o titular fornecer **todos os IDs de cobrança** de uma mesma conta e ambiente da AbacatePay, no intervalo de criação especificado. O extrato deve incluir todos os estados, inclusive pendências e estornos. Uma lista parcial ou um extrato de liquidações por data de crédito pode produzir ausências esperadas. A consulta por campos do exemplo anterior continua disponível para conferir destino, estado e diferenças em centavos.

Salve um JSON local com os IDs extraídos do extrato higienizado. `from` inclui o instante inicial e `until` exclui o instante final. Use UTC com segundos e, opcionalmente, três dígitos de milissegundos. `devMode: true` seleciona as cobranças de teste. Uma lista vazia precisa vir como `"chargeIds": []` e exige confirmação de que o extrato está completo.

```json
{
  "complete": true,
  "devMode": true,
  "from": "2026-11-01T00:00:00Z",
  "until": "2026-12-01T00:00:00Z",
  "chargeIds": ["pix_fin01_match", "pix_fin01_cent"]
}
```

Na raiz do projeto, com Node 24 e as dependências do workspace, passe o caminho do JSON e a pasta local de estado que foi usada em `wrangler d1 ... --persist-to`. A pasta, o banco migrado e os lançamentos de teste devem existir. Ajuste o período do exemplo à data de criação dos lançamentos da sua fixture.

```sh
node apps/api/scripts/check-complete-pix-statement.mjs /caminho/extrato-teste.json /caminho/estado-wrangler
```

O [verificador](../../apps/api/scripts/check-complete-pix-statement.mjs) executa um `SELECT` no D1 local usando a configuração de conciliação existente. Lê somente os identificadores do registro e da cobrança e um sinal de data ilegível. Comprovantes manuais ficam fora da consulta. Os IDs do arquivo são comparados localmente. Preserve o relatório no ambiente de teste.

| Resultado | Interpretação |
|---|---|
| `d1_only` | O D1 registrou a criação na janela selecionada e o ID falta na lista do extrato. |
| `statement_only_in_scope` | O extrato contém o ID e a consulta no recorte do D1 não o encontrou. Conferir a conta, o ambiente e as bordas do período. |
| `duplicate_statement` | O mesmo ID consta mais de uma vez no extrato normalizado. |
| `missing_d1_charge_id` ou `unknown_d1_creation_time` | O registro local precisa de investigação antes de concluir a comparação. Uma data ilegível no ambiente selecionado impede situar o registro dentro ou fora da janela. |

O processo termina com código **0** quando as listas conferem, **1** quando o relatório contém diferenças e **2** quando a entrada ou a consulta falha. A conferência cobre os IDs de criação das cobranças. Os relógios de criação no provedor e de gravação no D1 podem divergir junto aos limites. Reconfira esses IDs no período vizinho antes de concluir que falta uma cobrança. Um resultado 0 não comprova valor, crédito à beneficiária ou liquidação; essas conferências usam o extrato financeiro em FIN-02.

## Exemplo de contagem

Uma única pessoa de teste, em uma aba e com conta inicialmente sem progresso, abre a casa publicada A, fecha o painel e perde a conexão. Depois que o socket antigo sai, ela reconecta, volta à mesma casa, joga uma rodada de Memória que abandona antes da vitória e faz um Pix **global de R$ 10,00**. A mesma confirmação chega duas vezes. A base controlada começa vazia de doações, com as fontes disponíveis.

| Indicador | Resultado para o cenário |
|---|---|
| Simultâneos | Na sala isolada, 1 → 0 → 1 conexão. Pico de 1. Duas abas ao mesmo tempo dariam 2 conexões. A API pública não informa quantas pessoas estão na Vila. |
| Visitantes históricos | O roteiro conhece 1 pessoa. O sistema não oferece uma contagem histórica verificável. |
| Visitas à casa A | 2 aberturas, 1 visitante, 1 evento de progresso da missão no fluxo normal sincronizado. Se a regra aprovada for por entrada, o esperado é 2. Se for por pessoa única, é 1. Hoje a métrica está indisponível. |
| Jogadores de Memória | 1 pessoa iniciou a rodada, 0 vitórias e 0 eventos de vitória. O número de jogadores permanece indisponível. |
| Doações globais | 1 doação e 1.000 centavos (R$ 10,00). |
| Doações por ONG | A recebe 0 doações dirigidas e 0 centavos. O mesmo vale para uma ONG B de controle. Visitar A não altera o destino da cobrança. |
| Doações totais | 1 doação e 1.000 centavos (R$ 10,00). O replay conserva os dois valores. |

**Evidência local.** O exemplo de navegação acima aplica as regras do código. A prova financeira usou SQLite em memória com as 15 migrações do projeto. Antes da cobrança, a consulta total retornou `(0, 0)`. Depois das duas entregas sintéticas do mesmo evento, a primeira inserção do identificador alterou uma linha e a repetição alterou zero. O recorte global e o total retornaram `(1, 1000)` e o recorte da ONG A retornou `(0, 0)`. Este exercício verifica o esquema e as agregações. Em separado, o teste da API percorreu o handler com provedor simulado para um Pix dirigido de 1.000 centavos, incluindo a confirmação repetida. [Banco de teste que aplica as migrações reais][dbtest] · [Teste de confirmação][moneytest]

Na revisão indicada acima, **6 testes focalizados de API/progresso e 3 de presença passaram**. Para reproduzir os mesmos filtros a partir da raiz da revisão:

```sh
(cd apps/api && ./node_modules/.bin/vitest run --maxWorkers=1 src/api.test.ts src/donations.test.ts src/progress.test.ts -t 'indicators never invent|indicators count only|marks the donation paid|reverses the credit on a refund|records an admin-verified proof|recovers missions')
(cd apps/server && ./node_modules/.bin/vitest run --maxWorkers=1 src/room.test.ts -t 'assigns anonymous ids|also after a reconnect|removes only members idle')
```

## MET-01 · Conferência interna por destino e fonte

Com doações habilitadas no ambiente, administradores consultam **Pendentes → Doações confirmadas por destino** no painel. O campo `paidByDestination` de `GET /admin/donations/overview` usa a mesma consulta abaixo, independentemente do limite da lista de configuração de ONGs e do histórico recente. A tabela mostra o acumulado da base em centavos convertidos para reais, somente para as cobranças atualmente pagas. Se a API ainda não informar os totais, o painel indica indisponibilidade. A divulgação pública de um indicador financeiro continua dependendo de decisão.

Para conferir os registros da base D1 local, aplique as migrações e execute a [consulta por destino](../../apps/api/scripts/summarize-paid-donations.sql) a partir da raiz:

```sh
pnpm db:migrate:local
pnpm --filter @vila/api exec wrangler d1 execute vilanoeldobem --local --file scripts/summarize-paid-donations.sql
```

A consulta lê as doações cujo estado atual é `paid`, desde o início daquela base, inclusive as de sandbox. A linha `global` representa a parceira da Vila. Cada linha `ngo` usa o ID da ONG gravado na doação e continua presente após a retirada da casa. Uma ONG cadastrada sem valores elegíveis aparece com zeros. Se uma exclusão física anterior apagou o vínculo da cobrança, os valores dirigidos sem ID ficam na linha `ngo` de ID nulo. O `total` já inclui global e ONGs uma vez.

As colunas `pix_count` e `pix_gross_cents` contam cobranças Pix e somam seu bruto em centavos, antes das tarifas e da divisão. As colunas `proof_count` e `proof_amount_cents` contam registros manuais e somam os valores documentados. Uma referência repetida pode corresponder a dois registros manuais. A equipe deve conferir as referências antes de interpretar registros como pagamentos distintos. A consulta mantém as fontes separadas e a liquidação depende do extrato.

Exemplo local com um Pix global de R$ 10,00, um Pix dirigido de R$ 7,25 e um comprovante de R$ 5,00 para a mesma ONG. A confirmação do Pix dirigido chega duas vezes e a casa é retirada em seguida.

| Destino | Cobranças Pix pagas | Bruto Pix (centavos) | Registros de comprovantes | Valor documentado (centavos) |
|---|---:|---:|---:|---:|
| Global | 1 | 1.000 | 0 | 0 |
| ONG retirada | 1 | 725 | 1 | 500 |
| Total | 2 | 1.725 | 1 | 500 |

Um estorno posterior do Pix global reduz o total Pix para uma cobrança e 725 centavos. A evidência externa continua em 500 centavos. Com a base legível e vazia, os quatro valores do total são zero. Uma falha na leitura ou na aplicação das migrações deixa a conferência indisponível. Para a publicação da MET-01, seguem abertas as decisões de público, período e qual valor comunicar.

## Primeiro PR de implementação e decisões que faltam

**N5.2 proposta: quantidade de doações globais confirmadas, em um ambiente identificado.** Reusar D1 e o contrato de disponibilidade de `/indicators`. A definição candidata é uma cobrança no destino global em estado atual `paid`. Não exige migração nem evento de cliente. Nicolas e Augusto escolhem primeiro o público (P02 público ou painel administrativo). Bernard ratifica o significado de “confirmada”, e a frente de conciliação N3 valida a origem financeira.

### Consulta de diagnóstico em D1 local

Na raiz do repositório, com as dependências instaladas e as migrações aplicadas à base local `vilanoeldobem`, execute:

```sh
pnpm --filter @vila/api exec wrangler d1 execute vilanoeldobem --local --file scripts/count-paid-global-pix.sql
```

A [consulta](../../apps/api/scripts/count-paid-global-pix.sql) retorna uma linha. A coluna `paid_global_pix` conta as doações globais em estado atual `paid` na base local desta cópia do projeto. Um Pix global pago e um dirigido pago resultam em **1**, inclusive após repetir a confirmação. Um estorno do Pix global reduz esse exemplo a **0**. A base acessível e vazia também retorna **0**. Se a tabela ainda não existir ou a leitura falhar, o Wrangler encerra o comando com erro e a contagem fica indisponível.

**Aceite proposto para N5.2.** Em base controlada, confirmar um Pix global, repetir sua confirmação e incluir um Pix pago dirigido como controle. Conferir as duas linhas de origem: o total geral deve ser 2 e o global, 1. Em base legível sem globais pagas, o indicador deve ser 0. Com a fonte indisponível, deve vir `null` com motivo. O consumidor exibe, respectivamente, “1”, “0” e “—”. Anexar a fixture e as respostas esperada e observada ao PR de implementação. Se a base misturar produção e sandbox, acordar o filtro de ambiente e incluí-lo no teste.

| Quem decide | Pergunta que muda o número ou a coleta |
|---|---|
| Augusto, com Nicolas | Quem verá cada número e desde quando? Para simultâneos, basta informar conexões por praça ou é preciso contar pessoas em toda a Vila, inclusive no modo solo? Como tratar duas abas, reconexão e sala sem leitura? Para visitantes históricos, qual identificação e retenção são aceitas, e como tratar a passagem de visitante para conta? Qual ID vincula lote e ONG no momento da visita se a ocupação mudar? |
| Pedro, com Augusto | Na casa, vale abrir o painel, entrar na cena ou voltar depois de sair? Conta por entrada, sessão ou visitante? No minijogo, vale “Jogar”, a primeira jogada, a conclusão ou a vitória? Qual ID de jogo/rodada sobrevive à retomada? Quais IDs e categorias de missão da #66 serão usados para distinguir essas ações de um marco de progresso? |
| Bernard, com N3 | Confirmar quantidade e valor para cada destino. O valor comunicado é bruto, parcela destinada ou líquido após tarifas? Como apresentar disputa, estorno e recuperação? O que constitui prova externa única e como indicar pagamentos por link próprio sem comprovação? Essas escolhas afetam o rótulo, a soma e a possibilidade de conciliar o painel com o extrato. |

[api]: https://github.com/vilanoeldobem/project/blob/2c294767aa7756ceaf759eadb4799b7175dedc73/apps/api/src/api.ts#L176-L215
[release]: https://github.com/vilanoeldobem/project/blob/2c294767aa7756ceaf759eadb4799b7175dedc73/docs/reference/releases.md
[ui]: https://github.com/vilanoeldobem/project/blob/2c294767aa7756ceaf759eadb4799b7175dedc73/apps/client/src/ui/Indicators.tsx#L12-L51
[http]: https://github.com/vilanoeldobem/project/blob/2c294767aa7756ceaf759eadb4799b7175dedc73/apps/client/src/lib/api.ts#L40-L69
[room]: https://github.com/vilanoeldobem/project/blob/2c294767aa7756ceaf759eadb4799b7175dedc73/apps/server/src/room.ts#L82-L137
[do]: https://github.com/vilanoeldobem/project/blob/2c294767aa7756ceaf759eadb4799b7175dedc73/apps/server/src/room-do.ts#L47-L89
[net]: https://github.com/vilanoeldobem/project/blob/2c294767aa7756ceaf759eadb4799b7175dedc73/apps/client/src/net/multiplayer.ts
[hud]: https://github.com/vilanoeldobem/project/blob/2c294767aa7756ceaf759eadb4799b7175dedc73/apps/client/src/ui/Environment.tsx
[accounts]: https://github.com/vilanoeldobem/project/blob/2c294767aa7756ceaf759eadb4799b7175dedc73/migrations/0004_accounts_ngo_applications.sql#L8-L44
[oq]: https://github.com/vilanoeldobem/project/blob/2c294767aa7756ceaf759eadb4799b7175dedc73/docs/decisions/open-questions.md
[lot]: https://github.com/vilanoeldobem/project/blob/2c294767aa7756ceaf759eadb4799b7175dedc73/apps/client/src/ui/Lot.tsx#L33-L46
[missions]: https://github.com/vilanoeldobem/project/blob/2c294767aa7756ceaf759eadb4799b7175dedc73/packages/shared/src/game/progress.ts
[store]: https://github.com/vilanoeldobem/project/blob/2c294767aa7756ceaf759eadb4799b7175dedc73/apps/client/src/game/store.ts#L363-L378
[games]: https://github.com/vilanoeldobem/project/blob/2c294767aa7756ceaf759eadb4799b7175dedc73/apps/client/src/ui/Games.tsx
[memory]: https://github.com/vilanoeldobem/project/blob/2c294767aa7756ceaf759eadb4799b7175dedc73/apps/client/src/ui/MemoryGame.tsx#L42-L51
[progress]: https://github.com/vilanoeldobem/project/blob/2c294767aa7756ceaf759eadb4799b7175dedc73/apps/api/src/progress.ts
[sync]: https://github.com/vilanoeldobem/project/blob/2c294767aa7756ceaf759eadb4799b7175dedc73/apps/client/src/lib/account.ts#L194-L250
[schema]: https://github.com/vilanoeldobem/project/blob/2c294767aa7756ceaf759eadb4799b7175dedc73/migrations/0011_donations_abacatepay.sql
[money]: https://github.com/vilanoeldobem/project/blob/2c294767aa7756ceaf759eadb4799b7175dedc73/apps/api/src/donations.ts
[intents]: https://github.com/vilanoeldobem/project/blob/2c294767aa7756ceaf759eadb4799b7175dedc73/migrations/0013_donation_durable_intent.sql
[moneytest]: https://github.com/vilanoeldobem/project/blob/2c294767aa7756ceaf759eadb4799b7175dedc73/apps/api/src/donations.test.ts#L360-L431
[proof]: https://github.com/vilanoeldobem/project/blob/2c294767aa7756ceaf759eadb4799b7175dedc73/apps/api/src/donations.test.ts#L594-L614
[dbtest]: https://github.com/vilanoeldobem/project/blob/2c294767aa7756ceaf759eadb4799b7175dedc73/apps/api/test/d1.mjs

## MET-02 e MET-03 · Sinais disponíveis na versão 0.9.0

O catálogo atual tem dez minijogos. Esta conferência atualiza a leitura de 20/11 para a base `f551ebc`. Os exemplos usam praças, ocupantes e progresso de teste.

### MET-02 · Presença em uma praça

O servidor mantém uma entrada por conexão aceita em cada sala. Duas abas do mesmo participante de teste fazem a ocupação de A subir para 2. Se uma aba se reconectar em B antes do encerramento em A, as praças mostram 2 e 1 naquele intervalo. Encerrar as conexões antigas leva a 1 e 1, depois a 0 e 1. Os objetos das duas salas conhecem apenas os próprios membros. [Estado da sala](../../apps/server/src/room.ts) · [Teste das duas praças](../../apps/server/src/room.test.ts)

O HUD soma a própria conexão aos pares já observados nos snapshots do cliente. Pode haver diferença transitória entre esse valor e o total de conexões aceitas pelo servidor. A legenda indica **conexões nesta praça agora**. Em modo offline, o contador some. O estado observado em uma sala vazia e acessível é zero. Falta uma fonte agregada para informar simultâneos em toda a Vila ou visitantes únicos por período. Augusto e Nicolas decidem a abrangência e a unidade antes de publicar esses indicadores. [Conexões do cliente](../../apps/client/src/net/multiplayer.ts) · [Legenda do HUD](../../apps/client/src/ui/Environment.tsx)

### MET-03 · Casa, minijogo e progresso

| Percurso controlado | O que o progresso consegue registrar |
|---|---|
| Abrir a casa A, reabrir A e abrir a casa B depois de uma troca de ocupante em `plaza-01` | O painel chama `record("causes-visit-lot", "plaza-01")` três vezes. O progresso conserva uma chave distinta para o terreno. Esse marco também pode ocorrer em lotes listados disponíveis. Para atribuir visitas a ONGs, falta distinguir o ocupante no momento da visita. |
| Entrar pelo catálogo em cada um dos nove jogos da saga, voltar ao catálogo, reabrir e vencer | Abertura, retorno e vitória em jogo livre deixam zero chamadas de progresso. |
| Vencer o Trenó na Neve pela missão `b05-r1-07`, depois repetir e usar «Pular minijogo» após três tentativas | Ambas as ações registram a mesma interação `play-treno-na-neve` daquela missão. Contar essas chaves como vitórias incluiria o pulo. |
| Abrir o Jogo da Memória pela casa três vezes e sair antes de jogar, depois resolver os quatro pares no catálogo | As saídas deixam zero chamadas de vitória. Completar o tabuleiro registra `play-memory:win`. A chave de progresso é reutilizada em rodadas seguintes. |

IDs cobertos no catálogo livre da saga: `sino-afinado`, `fio-do-tempo`, `treno-na-neve`, `coro-dos-nomes`, `mapa-das-estrelas`, `lago-dos-reflexos`, `ponte-das-pegadas`, `forno-da-memoria` e `jardim-das-estacoes`. O décimo jogo é `jogo-da-memoria` (painel `memory`). [Catálogo](../../apps/client/src/ui/Games.tsx) · [Definições e interações](../../apps/client/src/game/story-games.ts) · [Jogo da Memória](../../apps/client/src/ui/MemoryGame.tsx)

O ensaio monta os painéis reais no Chromium, usa o armazenamento de progresso normal em um perfil descartável e observa apenas as chamadas de `record` em memória. A troca de ONG e a rede offline são estados controlados. Ele não mede tráfego da Vila. Pedro e Augusto ainda precisam definir o momento de contar a visita ou a partida, como reconhecer um retorno e como tratar repetição e pulo. [Casa](../../apps/client/src/ui/Lot.tsx) · [Painel da saga](../../apps/client/src/ui/StoryGamePanel.tsx) · [Store de progresso](../../apps/client/src/game/store.ts)

Para reproduzir localmente na raiz, com as dependências do lockfile e Chromium instalado:

```sh
(cd apps/server && ./node_modules/.bin/vitest run src/room.test.ts --maxWorkers=1)
(cd apps/client && CHROMIUM_PATH=/usr/bin/chromium node scripts/verify-indicator-signals.mjs)
```
