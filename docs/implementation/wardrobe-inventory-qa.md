# N6.1 · Inventário de visuais e condições de teste da compra

O AIOX QA verificou em 20/11/2026 a [main em 2c29476](https://github.com/vilanoeldobem/project/tree/2c294767aa7756ceaf759eadb4799b7175dedc73). A N6.1 da [#65](https://github.com/vilanoeldobem/project/issues/65) verifica o provador gratuito e delimita o que poderá ser testado em N6.2.

## N6.1 · Resultado do gratuito

**Aprovado em navegador local.** Um visitante sem login equipou o Gorro de tricô (`helmet-beanie`, categoria Capacete). Após recarregar a página na mesma origem e reabrir **Aparência → Visuais**, o cartão voltou marcado **Em uso**. O inventário continuou com **30 de 80** gratuitos. Equipar mudou a seleção do avatar; a missão já dava acesso à peça.

| Momento | Capacete no avatar | `localStorage["vila.look.v2"]` → `helmet` | Cartão do Gorro de tricô |
|---|---|---|---|
| Ao abrir | `helmet-santa` | Chave ausente | Já disponível |
| Provar | `helmet-santa` | Chave ausente | Prévia de `helmet-beanie` |
| Equipar | `helmet-beanie` | `helmet-beanie` | Em uso |
| Recarregar e reabrir | `helmet-beanie` | `helmet-beanie` | Em uso, botão desabilitado |

**Ambiente.** Chromium 155.0.8059.84, perfil isolado, origem `http://127.0.0.1:18651`. A preparação gravou a missão fictícia `explore-gifts` concluída, com 30 XP, em `vila.progress.v2`. A chave do look começou ausente. O teste abriu Aparência pelo atalho de QA do build local e clicou nos controles reais. O reload foi confirmado pela Navigation Timing API. Entre “Provar” e “Equipar” o navegador registrou zero chamadas fetch/XHR e zero requisições com método diferente de GET. O teste rodou com multiplayer desligado e tráfego fora da origem local bloqueado. A prova usou apenas armazenamento local do navegador.

**Comandos executados** a partir da raiz da worktree, com dependências do lockfile instaladas. O último comando usa o script auxiliar da sessão; o roteiro abaixo permite reproduzir os pontos observados diretamente no navegador.

```sh
nice -n 19 ionice -c3 env RAYON_NUM_THREADS=1 mise exec node@22 -- corepack pnpm --filter @vila/client exec vitest run src/game/wardrobe.test.ts src/ui/Wardrobe.test.tsx --maxWorkers=1
nice -n 19 ionice -c3 env RAYON_NUM_THREADS=2 GOMAXPROCS=2 mise exec node@22 -- corepack pnpm --filter @vila/client exec vite build --mode workers
nice -n 19 ionice -c3 python -m http.server --bind 127.0.0.1 --directory apps/client/dist 18651
# Em outro terminal, na raiz da mesma worktree
nice -n 19 ionice -c3 taskset -c 0,1 node ../n61-browser.mjs http://127.0.0.1:18651
```

Os dois arquivos do Vitest passaram (5/5). O build do cliente terminou com sucesso. A seleção, a gravação e o retorno foram verificados no Chromium. [Categorias e lojas](../../apps/client/src/game/wardrobe.ts) · [Teste das categorias](../../apps/client/src/game/wardrobe.test.ts) · [Teste da interface](../../apps/client/src/ui/Wardrobe.test.tsx) · [Verificador de lojas do projeto](../../apps/client/scripts/verify-shop.mjs).

**Reprodução manual no cliente local**

1. Abra a origem indicada em um perfil novo. Para preparar o mesmo visitante, execute uma vez no console e recarregue:

   ```js
   localStorage.setItem('vila.progress.v2', JSON.stringify({
     xp: 30, counters: {}, completed: { 'explore-gifts': true }, seen: {}
   }));
   localStorage.setItem('vila.environment.v1', JSON.stringify({ quality: 'low', multiplayer: false }));
   location.reload();
   ```

2. Abra **Aparência → Visuais → Capacete**. Confira “30 de 80”, prove o Gorro de tricô e consulte `JSON.parse(localStorage.getItem('vila.look.v2'))?.helmet` antes e depois de clicar em **Equipar**.
3. Recarregue na mesma aba, reabra o provador e compare o cartão e a chave com a última linha da tabela. Percorra as dez categorias e confira a ausência de “Ver compra”.

## Onde para o fluxo pago

No Chromium, as dez categorias mostraram oito cartões gratuitos cada. A contagem total foi de 80 gratuitos, zero pagos e zero botões “Ver compra”. O catálogo técnico inclui 20 entradas pagas nas dez categorias. A Coroa dourada (`helmet-crown`) serve como controle de ausência. Em `Wardrobe.tsx`, `SHOW_PAID_PREVIEWS = false` faz o filtro de `items` excluir essas entradas antes de criar os cartões. Assim, o jogador sequer chega a “Ver compra”. O código desse botão, hoje inacessível, apenas muda o estado local `paidNote` para exibir “A compra de visuais não está disponível.”. O ajuste de 14/11, incorporado ao ADR, registra a decisão de ocultar as prévias até resolver a exposição a menores. [Provador](../../apps/client/src/ui/Wardrobe.tsx) · [Ajuste da IMPL-0027](../decisions/0027-cosmetic-shop-wardrobe.md#ajuste-de-14112026-prévias-pagas-ocultas) · [PR #48](https://github.com/vilanoeldobem/project/pull/48).

Na mesma revisão, `isUnlocked` devolve falso para itens pagos, `sanitizeLook` aceita apenas itens desbloqueados e a presença recusa um look com item pago. A API oferece progresso de missões por conta e rotas de doação. Faltam pedido comercial de cosmético, processamento de sua confirmação e concessão persistente para uma conta. A rota `/donations/pix` cria cobranças de doação. [Regras do catálogo](../../packages/shared/src/game/cosmetics.ts) · [Presença](../../packages/shared/src/net/protocol.ts) · [Rotas da API](../../apps/api/src/api.ts).

## N6.2 · Matriz de compra em homologação

Os cinco casos transacionais estão bloqueados. O controle disponível hoje é verificar a ausência de oferta no provador. Para iniciar os casos abaixo, a equipe precisa entregar um checkout comercial em ambiente de teste, uma conta de jogador fictícia e um SKU pago aprovado por Pedro, com preço definido. A DEC-055 já fixa o piso de R$ 2,00 por cosmético e destina toda a receita à conta comercial do aplicativo, sem divisão com ONGs ou inclusão em doações. O preço do SKU continua em aberto. [DEC-055](https://github.com/vilanoeldobem/docs/pull/6).

| Caso | Ação e critério de aceite | Pré-requisito específico |
|---|---|---|
| Confirmação | Registrar a posição inicial, criar o pedido e confirmar. A conta compradora passa a possuir o SKU uma vez. Conciliar pedido, valor e crédito no extrato comercial. A variação na quantidade e no valor das doações globais e por ONG deve ser zero. | Vincular conta, SKU, pedido e cobrança a uma confirmação verificável do provedor. Disponibilizar inventário por conta, extrato comercial e indicadores antes/depois. |
| Confirmação repetida | Reentregar a confirmação do **mesmo pagamento**. Conferir um pedido liquidado, uma concessão para a mesma conta e um único crédito comercial, com doações inalteradas. | Pedido já confirmado e forma de reentregar o evento na sandbox, com identificadores estáveis para conferir a deduplicação. |
| Cancelamento antes de confirmar | Cancelar pedido pendente. Conferir o estado final do pedido, ausência de concessão, ausência de crédito liquidado e inventário igual ao inicial. | Pedido pendente cancelável e sinal de cancelamento consultável no ambiente de teste. |
| Estorno após confirmação | Estornar a compra confirmada. Correlacionar lançamento original e reversão no extrato comercial, conferir doações inalteradas e verificar a posse e o visual equipado segundo a regra aprovada. | Compra confirmada estornável, evidência da reversão na sandbox e decisão de Bernard sobre entrega, retirada ou manutenção do item e efeito se estiver em uso. |
| Retorno à conta | Após a compra confirmada, sair e entrar na mesma conta em um perfil limpo. Verificar no inventário o mesmo SKU uma vez, sem nova cobrança. Uma conta de controle sem a compra não recebe o item. | Login de teste e concessão recuperável do servidor por conta e produto. A restauração do item equipado entre dispositivos exige regra própria, caso o produto queira verificá-la. |

No ensaio futuro, guardar IDs fictícios de conta, SKU, pedido, cobrança, evento de confirmação e vínculo de inventário. Cruzar com os lançamentos do extrato e a leitura dos indicadores de doação no mesmo intervalo isolado. Nesta revisão não há pedido de cosmético sobre o qual executar essas operações. A implementação do checkout precisa de story própria após a decisão de escopo.

## Decisões para Pedro, Bernard e o chat 4

- **Pedro** indica os IDs de referência do catálogo e o retorno que o jogo deve apresentar ao equipar, confirmar, cancelar e reabrir. Pedro mantém a responsabilidade pelas peças e pelo catálogo de lançamento.
- **Bernard** decide se a compra entra no lançamento, o preço concreto, as regras para menores e a política de entrega e estorno. A equipe registra decisão, data e referência antes de fixar os resultados esperados dependentes dessas escolhas.
- **Chat 4, Augusto e Pedro** precisam conciliar a troca de skin mediante cadastro pedida na #65 com o acesso local do visitante previsto na OQ-02. Definir quando exigir login (prévia, equipar ou comprar), como tratar o progresso local e se a ação é retomada após autenticar ou cancelada ao desistir. Hoje a conta sincroniza eventos de missão. O look usa uma chave local por origem e é revalidado quando o progresso muda de dono. Uma nova sessão no mesmo navegador pode reutilizar essa chave. O teste de propriedade paga exige um perfil limpo. [OQ-02 e OQ-21](../decisions/open-questions.md) · [Sessão e sincronização](../../apps/client/src/lib/account.ts) · [Persistência do visual](../../apps/client/src/game/store.ts).
