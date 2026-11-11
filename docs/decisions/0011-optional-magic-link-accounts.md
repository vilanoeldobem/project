# IMPL-0011 — Conta opcional com link mágico e validação local

**Status:** Proposta — implementada para revisão, produção desabilitada
**Data:** 2026-11-10
**Fontes:** OQ-02, OQ-03, OQ-08; DEC-038; autorização do responsável para iniciar a entrega de login.

## Contexto

A Vila continua acessível sem conta. O cadastro pede nome, nickname, cidade e e-mail; apenas nickname
pode ser público. Login por link mágico já foi escolhido, mas o provedor de e-mail e a liberação operacional
da coleta de dados ainda estão pendentes. O desenvolvimento não precisa esperar esses acessos.

## Decisão

- Implementar conta, sessão e saída no Worker existente, com D1 como única persistência de servidor.
- Gerar credenciais aleatórias de 256 bits, armazenadas como SHA-256. Link dura 15 minutos; sessão, 7 dias,
  sem renovação silenciosa. Conta só nasce quando o e-mail é confirmado.
- Exigir confirmação explícita por POST; token chega no fragmento da URL e é retirado imediatamente, inclusive
  na navegação na mesma aba. GET, prévias e scanners não consomem o link.
- Vincular o link ao navegador que fez o pedido com um segundo token HttpOnly. O usuário deve abrir o link
  nesse mesmo navegador. Isso evita troca de sessão por links de login iniciados por terceiros.
- Criar conta, emitir sessão, invalidar a sessão anterior apresentada e consumir o link em um único batch
  transacional. E-mail e nickname têm unicidade case-insensitive no banco; perfil existente nunca é sobrescrito
  por um novo pedido de cadastro. Nickname aceita somente letras ASCII, números e sublinhado, de 3 a 24 caracteres.
- Usar cookies host-only, HttpOnly, SameSite=Lax, Path=/ e Secure em HTTPS. HTTP só funciona no modo local
  explicitamente configurado em localhost/127.0.0.1/::1. Cliente e API usam origens distintas. `AUTH_API_ORIGIN` valida a API e `AUTH_PAGE_ORIGIN` valida o jogo e o destino do link. CORS credenciado fica restrito à origem exata autorizada; o cliente usa `credentials: include`. Escritas exigem Origin exata; nada de CORS aberto.
- Respostas não revelam existência de e-mail, não são cacheadas e nunca contêm credenciais. Limites atômicos
  por IP e e-mail reduzem abuso. Corpo JSON é limitado a 4 KiB. Logs não incluem dados pessoais nem tokens.
- Entrega de e-mail fica restrita ao adaptador local: uma caixa no D1 local, lida pelo CLI, sem rota HTTP.
  O adaptador e todas as operações de conta falham fechados fora desse ambiente, mesmo que AUTH_MODE=local
  seja configurado por engano em hostname público. Não existe provedor de produção nesta entrega.

## Alternativas consideradas

- Senhas: incompatíveis com OQ-03 e ampliariam a responsabilidade de segurança.
- Tokens em query string ou consumo por GET: exporiam credenciais em logs e permitiriam consumo por prévias.
- Token na resposta da API ou em logs de desenvolvimento: facilitaria um bypass acidental em produção.
- Serviço externo de autenticação: adicionaria uma decisão e uma dependência ainda não aprovadas.

## Consequências

O fluxo completo pode ser validado localmente. Progresso e XP continuam no navegador e não acompanham a conta.
Links não funcionam em outro navegador/dispositivo; a UI orienta a solicitar novamente no navegador desejado.
A caixa local contém links brutos para teste, portanto só deve receber dados fictícios e nunca ser copiada para
produção. Links consumidos e expirados são removidos; limpeza dos expirados acontece em novos pedidos/confirmações.

Antes de habilitar produção: escolher e integrar o provedor (OQ-08), configurar domínio/remetente e segredos,
validar privacidade e retenção, preparar staging e revisar limites de abuso para tráfego real. Só então substituir
o adaptador local por entrega real, mantendo os mesmos contratos de verificação e testes. Nada é publicado
ou migrado no remoto por este ADR.

## Relacionados

[Guia de login local](../guides/auth-local.md) · [API](../reference/api.md) · [D1](../reference/storage.md)
