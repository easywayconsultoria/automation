# EasyWay AI

Base de produção do sistema operacional da EasyWay: Next.js 15, Supabase Auth, PostgreSQL e Prisma.

## Setup local

Requer Node 20 (a versão está em `.nvmrc`) e acesso ao projeto Supabase.

```bash
nvm use
npm install
cp .env.example .env.local
npm run db:deploy
npm run dev
```

Edite `.env.local` antes de aplicar a migration. Acesse `http://localhost:3000`, crie uma conta e confirme o e-mail se a confirmação estiver habilitada.

## Qualidade

```bash
npm run typecheck
npm run lint
npm run format:check
npm run build
```

Detalhes de configuração estão em [docs/setup.md](docs/setup.md), e o último resultado operacional está em [docs/validation.md](docs/validation.md). Migrations usam `DIRECT_URL` em um fluxo controlado; o runtime usa somente a conexão pooled em `DATABASE_URL`.

## Arquitetura

- App Router com páginas públicas e protegidas em route groups.
- Sessão Supabase em cookies HTTP e validação de usuário no servidor.
- Prisma usado apenas no servidor; nenhuma query aceita `userId` vindo do cliente.
- Primeiro acesso cria perfil, workspace e membership `OWNER` atomicamente.
- Logs de aplicação são JSON; eventos críticos também persistem em `audit_logs`.
- O schema admite membros, mas esta fase cria um workspace por proprietário.
