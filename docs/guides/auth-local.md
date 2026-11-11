# Testar cadastro e login localmente

> **Status:** implementado para revisão local (Unreleased) · **Schema D1:** v4 · **Atualizado em:** 2026-11-10
> **Fonte de verdade:** `apps/web/worker/auth.ts`, `apps/web/scripts/verify-auth.mjs`
> Envio real de e-mail e autenticação pública continuam desabilitados (OQ-08).

Use Node 24 ou superior, dependências instaladas e apenas dados fictícios. A conta pede nome, nickname,
cidade e e-mail. Missões e XP continuam no `localStorage`, sem sincronização com a conta.

## Preparar

Na raiz do repositório:

```bash
cp apps/web/.dev.vars.example apps/web/.dev.vars
pnpm --filter @vila/web db:migrate:local
pnpm dev:worker
```

Abra **http://localhost:8787**, exatamente a origem de `.dev.vars`. Esse arquivo é ignorado pelo Git.
Não misture localhost com 127.0.0.1: origem e cookies são diferentes. As três condições são obrigatórias:
`ENVIRONMENT=development`, `AUTH_MODE=local` e `AUTH_ORIGIN` igual à origem local. Nenhuma dessas opções deve
ser publicada no Worker. Não use bindings remotos no desenvolvimento desse adaptador.
O script `dev:worker` passa `--local --infer-origin-from-routes=false` ao Wrangler para preservar a origem
localhost. Ao iniciar o Wrangler diretamente, mantenha essas opções; inferir a origem da rota de produção
faz o bloqueio de segurança recusar corretamente o adaptador local.

## Validar o fluxo manual

1. Abra **Minha conta → Criar conta**. Preencha os quatro campos com dados fictícios e solicite o link.
2. A conta ainda não existe. O adaptador grava uma mensagem somente no D1 local, sem mandar e-mail.
3. Em outro terminal, leia a caixa local:

   ```bash
   cd apps/web
   pnpm exec wrangler d1 execute vilanoeldobem --local --command "SELECT recipient, link FROM auth_local_outbox ORDER BY created_at DESC;"
   ```

4. Abra o link no **mesmo navegador/perfil** que fez o pedido. O fragmento desaparece imediatamente da URL;
   clique **Confirmar acesso**. Agora a conta é criada, o cookie de sessão é emitido e a mensagem é removida.
5. Recarregue a página: a sessão permanece. Use **Sair da conta**: ela é invalidada no servidor.
6. Para voltar, use **Já tenho conta** e informe só o e-mail. Um novo cadastro com esse e-mail não altera o perfil.

O link vale por 15 minutos e é de uso único. Se o nickname já estiver ocupado, peça outro link de cadastro
com um nickname diferente. Credenciais ficam apenas em memória/cookies, nunca no `localStorage`.
O CLI acima mostra uma credencial temporária: não publique sua saída ou capturas em issues/PRs.
Não existe `/api/auth/outbox` nem endpoint que revele links.

## Verificação automática

```bash
pnpm --filter @vila/web exec vitest run worker/auth.test.ts src/lib/auth.test.ts --maxWorkers=2
pnpm typecheck
pnpm build
CHROME_EXECUTABLE_PATH=/usr/bin/chromium node apps/web/scripts/verify-auth.mjs http://localhost:8787
```

O último comando usa o Worker local já rodando e cria contas de teste no D1 local. Confere cadastro ainda
não verificado, confirmação na mesma aba, sessão após reload, saída, replay e novo login em desktop/celular.
Sem `CHROME_EXECUTABLE_PATH`, usa o Chrome instalado padrão. O navegador recebe `TMPDIR=/tmp` e perfil isolado.
As provas unitárias usam o SQL real com `node:sqlite`, chaves estrangeiras e transações; o teste de navegador
completa a prova no runtime real do Worker/D1.

## Limites desta entrega

- Produção responde `auth_unavailable` para escritas; o visitante pode continuar explorando normalmente.
- Nenhum provedor de e-mail foi escolhido ou contratado. O ponto de substituição está em `requestLink`, no
  adaptador de entrega de `worker/auth.ts`; entregar e-mail real exige implementação e revisão próprias.
- Nenhuma migration remota, deploy, pagamento, admin de ONG ou progresso de servidor faz parte desse fluxo.

[Decisão técnica](../decisions/0007-optional-magic-link-accounts.md) · [Contrato HTTP](../reference/api.md)
