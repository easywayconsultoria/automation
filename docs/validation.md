# Evidência de validação da fundação

Data da auditoria: 2026-07-14.

| Verificação               | Resultado           | Evidência                                                                                                 |
| ------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------- |
| Instalação determinística | aprovado            | `package-lock.json` presente; `npm install --package-lock-only` concluído                                 |
| Schema Prisma             | aprovado            | `npm run db:validate` retornou schema válido                                                              |
| TypeScript                | aprovado            | `npm run typecheck`, exit code 0                                                                          |
| ESLint                    | aprovado            | `npm run lint`, exit code 0                                                                               |
| Formatação                | aprovado            | `npm run format:check`, todos os arquivos aprovados                                                       |
| Build Next.js             | aprovado            | `npm run build`, rotas e middleware gerados                                                               |
| Migration remota          | aprovado            | `20260714180000_initial` aplicada; schema remoto confirmado atualizado                                    |
| Supabase Auth E2E         | aprovado            | conta confirmada; login e logout reais aprovados; recuperação solicitada                                  |
| Workspace E2E             | aprovado            | workspace renderizado e perfil, workspace, membership OWNER e auditoria confirmados                       |
| Vercel                    | aprovado            | produção `Ready` em `https://easyway-ai.vercel.app`; login e workspace validados                          |
| GCP                       | referência validada | projeto `easy-way-consultoria-aduaneira` retornou estado `ACTIVE`; bootstrap dry-run não alterou recursos |

O build foi executado no host disponível com Node 18.20.8 e concluiu, mas apresentou o aviso esperado de runtime depreciado do Supabase. O runtime declarado e usado pela CI é Node 20.19 ou superior; a validação final de deploy deve ocorrer nesse runtime.

A migration foi aplicada no Supabase pelo session pooler. As quatro tabelas foram confirmadas no catálogo com RLS habilitada. A conta de teste foi confirmada e o formulário real de login retornou `303 /workspace` com cookie de sessão. O workspace respondeu 200 e renderizou seu estado inicial. O banco confirmou um perfil, um workspace, uma membership `OWNER` e os eventos `signin`, `signout` e `workspace_created`. O formulário de recuperação de senha aceitou a solicitação e disparou o e-mail correspondente.

O projeto Vercel está vinculado a `easy-way-canoas/easyway-ai`. O deploy de produção `dpl_619RPpKwp3cQ72eoKN2R9FEgL78a` ficou `Ready`, com alias estável `https://easyway-ai.vercel.app`. As páginas `/login` e `/signup` responderam 200, `/workspace` sem sessão redirecionou para `/login`, o formulário remoto de login retornou `303 /workspace` com cookie e o workspace autenticado respondeu 200.
