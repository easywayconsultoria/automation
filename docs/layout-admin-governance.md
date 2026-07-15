# Administração segura de contratos CSV

## Objetivo e acesso

A área `/workspace/admin/layouts` permite administrar contratos CSV sem alterar processos reais durante a preparação. Ela só existe quando `LAYOUT_ADMIN_ENABLED=true` e exige associação `OWNER` ou `ADMIN` no workspace. A checagem ocorre no servidor; esconder o link não é o mecanismo de segurança.

Definições globais (`workspaceId` nulo) aparecem apenas para consulta e sandbox. Criação, edição e transição de status aceitam somente definições do workspace autenticado. Todas as queries administrativas combinam explicitamente escopo e filtros de busca.

## Ciclo de vida

Cada `CsvLayoutDefinition` possui um dos estados:

- `DRAFT`: editável e ainda fora do parser operacional;
- `TESTING`: congelado para validação em sandbox;
- `ACTIVE`: elegível pelo parser de imports reais;
- `INACTIVE`: retirado do parser, mas preservado;
- `DEPRECATED`: encerrado e somente leitura.

Transições aceitas:

```text
DRAFT -> TESTING | INACTIVE
TESTING -> DRAFT | ACTIVE | INACTIVE
ACTIVE -> INACTIVE | DEPRECATED
INACTIVE -> DRAFT | ACTIVE
DEPRECATED -> (nenhuma)
```

A ativação exige pelo menos um sandbox aprovado e rejeita uma assinatura de cabeçalho que já esteja ativa para o mesmo tipo no escopo global/workspace. Cada transição gera `CsvLayoutStatusEvent` e `AuditLog`. Alterações de conteúdo são permitidas apenas em `DRAFT` e também geram auditoria.

## Sandbox isolado

O sandbox recebe um CSV de até 1 MB, usa exclusivamente o contrato selecionado e não cria processo, item, import ou proposta. Ele persiste somente:

- nome do arquivo;
- cabeçalho recebido e mapeado;
- contagem de linhas válidas e inválidas;
- erros determinísticos;
- prévia das primeiras dez linhas válidas;
- resultado aprovado/reprovado, ator e data.

Um teste passa somente quando a assinatura corresponde à versão selecionada, existe ao menos uma linha válida e não há erro. Aliases são aplicados antes das validações canônicas do Portal Único ou drawback.

## Efeito no parser operacional

Imports reais consultam apenas contratos `ACTIVE`, globais ou do workspace atual. A detecção continua determinística pela igualdade exata e ordenada do cabeçalho. O vínculo persistido é conferido pela versão **e** pela assinatura recebida, evitando ambiguidade entre contratos com versões iguais.

Contratos `DRAFT`, `TESTING`, `INACTIVE` e `DEPRECATED` nunca entram na lista operacional. Um cabeçalho sem contrato ativo compatível é rejeitado com erro claro e não recebe versão detectada.

## Rollout e rollback

1. Aplicar a migration incremental com a flag desligada. Os antigos `active=true` tornam-se `ACTIVE`; os demais tornam-se `INACTIVE`. A coluna `active` é mantida temporariamente para a versão anterior continuar operando durante o preview (expand/contract).
2. Habilitar `LAYOUT_ADMIN_ENABLED=true` apenas em Preview e validar autenticação, permissão, CRUD de rascunho, sandbox e histórico.
3. Publicar o código em produção mantendo a flag desligada.
4. Habilitar a flag em produção somente após aceite operacional; ainda assim, apenas OWNER/ADMIN acessam.

Rollback imediato da interface: definir `LAYOUT_ADMIN_ENABLED=false` e redeployar. Rollback de um contrato: mover `ACTIVE` para `INACTIVE`; os layouts globais anteriores permanecem ativos. A migration não remove definições, dados de imports nem a coluna legada `active`.

## Limitações atuais

- Cabeçalhos são comparados em ordem exata.
- O separador suportado pelo parser atual é vírgula.
- Regras JSON são metadados contratuais; as validações executáveis continuam sendo as regras determinísticas canônicas dos parsers.
- A coluna legada `active` deve ser removida em uma migration de contração somente após a estabilização do novo deploy.
- Não há LLM, OCR, RAG, consulta governamental ou integração externa.
