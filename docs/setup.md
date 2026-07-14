# Configuração de ambientes

## Supabase

Projeto: `oyqrrqvvlmajlcjugwpf`.

1. Em **Project Settings > API**, copie Project URL e a chave publishable para `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
2. Em **Project Settings > Database**, obtenha a connection string do transaction pooler (porta 6543) para `DATABASE_URL` e a conexão direta ou session pooler (porta 5432) para `DIRECT_URL`. O session pooler é necessário quando a rede não oferece IPv6. Faça URL-encode da senha.
3. Valide o estado e aplique a migration pelo fluxo controlado descrito abaixo.
4. Em **Authentication > Providers > Email**, habilite Email/Password. Para produção, mantenha confirmação de e-mail ativa e defina senha mínima de 8 caracteres.
5. Em **Authentication > URL Configuration**, configure Site URL com o domínio de produção e Redirect URLs:
   - `http://localhost:3000/**`
   - `https://<dominio-de-producao>/**`
   - opcional para previews: `https://*-<time>.vercel.app/**` conforme política do projeto

Não exponha senha do banco, `DIRECT_URL` ou futuras service-role keys com prefixo `NEXT_PUBLIC_`.

## Variáveis

| Variável                               | Escopo           | Obrigatória     | Uso                                  |
| -------------------------------------- | ---------------- | --------------- | ------------------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`             | cliente/servidor | sim             | endpoint Supabase                    |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | cliente/servidor | sim             | autenticação com RLS                 |
| `DATABASE_URL`                         | servidor         | sim             | Prisma em runtime, pooled            |
| `DIRECT_URL`                           | migration runner | sim nesse fluxo | migrations Prisma                    |
| `APP_URL`                              | servidor         | sim             | callbacks; URL canônica por ambiente |

`DIRECT_URL` é obrigatória somente no ambiente controlado que executa migrations. Não precisa ser exposta ao runtime da Vercel.

### Valores por ambiente

| Ambiente   | `APP_URL`                         | Banco                                       | Redirect Auth                                    |
| ---------- | --------------------------------- | ------------------------------------------- | ------------------------------------------------ |
| Local      | `http://localhost:3000`           | pooler do projeto de desenvolvimento        | `http://localhost:3000/**`                       |
| Preview    | URL fixa de preview homologada    | banco de staging, preferencialmente isolado | URL fixa de preview; não use wildcard irrestrito |
| Production | domínio canônico HTTPS da EasyWay | banco de produção                           | somente o domínio canônico de produção           |

Não use o banco de produção em deploys Preview. Como o callback de recuperação precisa ser previamente autorizado no Supabase, prefira uma URL estável de staging em vez de uma URL Vercel efêmera.

## Aplicação segura de migrations

Execute fora do build da Vercel, com `DATABASE_URL` e `DIRECT_URL` apontando para o mesmo projeto:

```bash
npm ci
npm run db:validate
npm run db:status
npm run db:deploy
npm run db:status
```

Os scripts `db:*` carregam `.env.local` para desenvolvimento e execução manual. Em um runner que injeta as variáveis diretamente e não possui esse arquivo, use `npx prisma migrate status` e `npx prisma migrate deploy`.

Antes do deploy, confirme o project ref no hostname/usuário das duas URLs, faça backup quando já houver dados e revise o SQL em `prisma/migrations`. `db:migrate` usa `prisma migrate dev` e deve ser usado somente para criar migrations no desenvolvimento; nunca em staging ou produção. A migration inicial habilita RLS sem políticas nas quatro tabelas, bloqueando acesso pela Data API. Não há SQL manual adicional.

## Vercel

No time `easy-way-canoas`, importe o repositório GitHub. Cadastre as variáveis de runtime separadamente para Development, Preview e Production. `APP_URL` deve variar por ambiente. Não execute migrations no build; aplique `npm run db:deploy` de forma controlada antes do release que depende delas.

Produção atual: `https://easyway-ai.vercel.app`, projeto `easy-way-canoas/easyway-ai`.

Via CLI, após autenticar:

```bash
vercel link --scope easy-way-canoas
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
vercel env add DATABASE_URL
vercel env add APP_URL
vercel deploy
```

## RLS e limite de confiança

O browser acessa apenas Supabase Auth. As tabelas de aplicação são consultadas pelo servidor Next.js por uma conexão PostgreSQL protegida. A autorização é feita usando o usuário validado por `auth.getUser()` e relações de membership; IDs de usuário nunca vêm do formulário. A migration habilita RLS sem políticas, portanto `anon` e `authenticated` não conseguem consultar as tabelas pela Data API. Ao introduzir acesso direto, crie políticas baseadas em `auth.uid()` na mesma alteração; não desabilite RLS.

## Storage futuro

Crie buckets privados. Grave caminhos como `<workspace_uuid>/<document_uuid>/<filename>` e autorize leitura/escrita pela membership do workspace. Não crie bucket público para invoices ou documentos aduaneiros.
