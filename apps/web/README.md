# apps/web — Vila Noel do Bem

Cliente 3D (React 19 + Three.js via react-three-fiber) e Worker Cloudflare (Static Assets + D1)
num único deploy. Guia completo: [`docs/guides/development.md`](../../docs/guides/development.md).

```bash
pnpm install                 # na raiz do monorepo
pnpm dev                     # Vite em http://localhost:5173 (sem Worker: /api responde 404 e a UI degrada)
pnpm db:migrate:local        # aplica migrations/ no D1 local
pnpm dev:worker              # build + wrangler dev em http://localhost:8787 (Worker + D1 local)
node scripts/verify.mjs URL  # Chrome real: fluxo básico + capturas em verify-output/
pnpm run deploy              # build + wrangler deploy (`pnpm deploy` sem "run" é outro comando do pnpm) (ver docs/guides/deploy.md)
```
