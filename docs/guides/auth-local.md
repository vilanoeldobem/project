# Testar cadastro e login localmente

> Estado: implementação para revisão (IMPL-0011). Envio real e login público continuam desabilitados (OQ-08).

Use Node 24+, pnpm e somente dados fictícios. A conta pede nome, nickname, cidade e e-mail.
Missões, XP e aparência continuam neste navegador, sem sincronização com a conta.

## Preparar três serviços locais

Na raiz do repositório:

```bash
cp apps/api/.dev.vars.example apps/api/.dev.vars
pnpm db:migrate:local
pnpm --filter @vila/api dev
# Em outro terminal:
pnpm --filter @vila/server dev
# Em outro terminal:
pnpm --filter @vila/client dev:worker
```

Abra **http://localhost:8799**. A API fica em **http://localhost:8787** e a presença em **http://localhost:8788**.
A API usa `--infer-origin-from-routes=false` para preservar sua origem local em vez do domínio de produção.
`AUTH_API_ORIGIN` identifica a API; `AUTH_PAGE_ORIGIN` identifica o jogo e o destino do link.
Esta última origem também precisa estar em `ALLOWED_ORIGINS`. Não misture localhost e 127.0.0.1.

Para usar o Vite em :5173, troque `AUTH_PAGE_ORIGIN` em `.dev.vars` para `http://localhost:5173` e reinicie a API.
O arquivo é ignorado pelo Git. Nunca publique as opções do adaptador local no Worker.

## Validar a jornada

1. Abra **Criar conta ou entrar → Criar conta** e preencha dados fictícios.
2. O pedido ainda não cria conta. A entrega de teste fica somente no D1 local da API.
3. Leia a caixa em outro terminal:

   ```bash
   cd apps/api
   pnpm exec wrangler d1 execute vilanoeldobem --local --command "SELECT recipient, link FROM auth_local_outbox ORDER BY created_at DESC;"
   ```

4. Abra o link no **mesmo navegador/perfil** que fez o pedido. Ele aponta ao jogo, nunca à API.
   O fragmento desaparece imediatamente, inclusive na mesma aba. Clique **Confirmar acesso** para criar a conta.
5. Recarregue: a sessão permanece. **Sair da conta** invalida a sessão no servidor.
6. **Já tenho conta** solicita um novo link só com o e-mail. Repetir cadastro não altera o perfil existente.

O CLI mostra uma credencial temporária: não publique sua saída. Não existe endpoint de leitura da caixa.
O link dura 15 minutos e só funciona uma vez. Sessão e vínculo ficam em cookies HttpOnly da API; o jogo não lê
os cookies. O cliente usa `credentials: include`; CORS credenciado exige a origem exata do jogo, sem curinga.
Respostas de conta são `no-store`. HTTP sem Secure é exceção exclusiva de loopback; HTTPS sempre usa Secure.

## Verificação automática

```bash
pnpm --filter @vila/api exec vitest run src/auth.test.ts --maxWorkers=2
pnpm --filter @vila/client exec vitest run src/lib/auth.test.ts --maxWorkers=2
pnpm typecheck
pnpm test
pnpm build
CHROME_EXECUTABLE_PATH=/usr/bin/chromium node apps/client/scripts/verify-auth.mjs http://localhost:8799 http://localhost:8787
```

O último comando requer os três serviços rodando e cria contas fictícias no D1 local da API. Confere cadastro,
confirmação na mesma aba, sessão após reload, saída, replay e novo login em viewports desktop/celular.
Sem `CHROME_EXECUTABLE_PATH`, usa o canal Chrome. O navegador recebe `TMPDIR=/tmp` e perfil isolado.
As provas unitárias usam SQL real com `node:sqlite`, chaves estrangeiras e transações; cobrem também CORS,
callbacks para o jogo, origem inválida e os limites do adaptador. Nenhum resultado de celular físico é presumido.

## Limites

Produção falha fechada: o provedor de e-mail não foi escolhido nem integrado. O adaptador local não habilita
login de homologação/produção apenas por aplicar a migration. Autenticação multiplayer, pagamentos, admin de ONG
e progresso no servidor são entregas separadas. Nenhuma migration remota ou deploy faz parte deste guia.

[ADR IMPL-0011](../decisions/0011-optional-magic-link-accounts.md) · [API](../reference/api.md)
