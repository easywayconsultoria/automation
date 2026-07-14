# Vertical operacional de importação

> A gestão de produtos, aliases e a prioridade determinística de classificação estão documentadas em [catalog-matching.md](./catalog-matching.md).

## Fluxo

1. Crie um processo em `/workspace/processes`.
2. Adicione itens manualmente ou importe `docs/invoice-items.csv`.
3. Envie documentos privados de até 3,5 MB.
4. Rode a análise determinística.
5. Gere ou regenere o plano de ação.
6. Vincule um registro inicial de drawback quando aplicável.

O CSV aceita até 1 MB, exige todas as colunas do exemplo e rejeita a importação inteira quando alguma linha é inválida. `lineNumber` deve ser único dentro do processo.

## Segurança

Todas as queries Prisma usam `workspaceId` obtido da sessão validada no servidor. IDs de processo são sempre conferidos junto ao workspace antes de leitura ou escrita. As tabelas do domínio têm RLS habilitada sem políticas e, portanto, não são acessíveis pela Data API. O Prisma usa a conexão PostgreSQL protegida do servidor.

O bucket privado `process-documents` possui políticas de leitura e upload baseadas no primeiro segmento do caminho, que deve ser o UUID do workspace, e na membership associada a `auth.uid()`. Não há URL pública de documentos.

## Regras atuais

- processo sem itens;
- produto sem correspondência por código/alias;
- NCM ausente;
- quantidade ou preço inválido;
- divergência acima de 0,02 entre quantidade × preço unitário e total;
- descrição com menos de cinco caracteres;
- drawback em rascunho com inconsistência crítica.

O plano agrupa inconsistências abertas por tipo, mantém itens concluídos e regenera apenas ações ainda não concluídas. Nenhuma regra usa LLM nesta fase.
