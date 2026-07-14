# Fundação IA First

## Visão do produto

O processo de importação é a unidade de contexto da IA Corporativa. Ao abrir `/workspace/processes/[processId]`, o operador encontra primeiro a conversa persistente do caso, com histórico, composer, ações rápidas, anexos e painéis de estado. Itens, documentos, inconsistências, plano e drawback continuam disponíveis como detalhes operacionais abaixo da conversa.

Esta fase não usa LLM, OCR, RAG ou integração governamental. A experiência conversacional é sustentada por interpretação de intenção baseada em regras, tools server-side e respostas estruturadas reproduzíveis.

## Modelo conversacional

- `Conversation`: uma conversa única por `ImportProcess`, com workspace, criador, título e estado.
- `ConversationMessage`: mensagens `USER`, `ASSISTANT`, `SYSTEM` e `TOOL`, com conteúdo e JSON estruturado opcional.
- `ConversationAttachment`: vínculo entre a conversa, o processo e um `ProcessDocument`, com tipo e metadados.
- `ToolExecution`: entrada, saída, estado e duração das ferramentas internas.
- `SuggestedAction`: recomendação operacional persistente, ligada opcionalmente à mensagem de origem.

Processos existentes recebem conversa durante a migration. Novos processos criam a conversa e a primeira mensagem de sistema na mesma operação.

## Tools internas

| Tool                   | Comportamento                                                     |
| ---------------------- | ----------------------------------------------------------------- |
| `summarize_process`    | Resume itens, documentos, inconsistências, fornecedor e matching. |
| `list_inconsistencies` | Lista inconsistências abertas e severidades.                      |
| `run_analysis`         | Executa e persiste a análise determinística existente.            |
| `generate_action_plan` | Gera/regenera o plano a partir das inconsistências abertas.       |
| `list_documents`       | Lista documentos presentes no contexto.                           |
| `list_unmatched_items` | Usa o matching oficial para localizar itens sem correspondência.  |
| `list_ncm_issues`      | Localiza itens sem NCM.                                           |
| `summarize_drawback`   | Resume modalidade, status e referência do drawback.               |
| `suggest_next_steps`   | Produz recomendações conforme o estado atual.                     |

Cada execução valida sessão e processo, cria `ToolExecution`, persiste uma mensagem `TOOL`, uma resposta `ASSISTANT` e, quando aplicável, `SuggestedAction`. Execuções e turnos importantes também entram no `AuditLog`.

## Interpretação determinística

Mensagens são classificadas por termos e padrões explícitos em português. Pedidos sobre NCM, drawback, documentos, inconsistências, análise, plano ou itens sem classificação acionam a tool correspondente. Mensagens sem intenção específica recebem o resumo do processo. A saída vem exclusivamente do banco do workspace e das regras operacionais já existentes.

## Anexos da conversa

O composer lateral aceita invoice, CSV do Portal Único, CSV de drawback e arquivo de apoio. O arquivo é gravado no bucket privado `process-documents`; a mesma transação cria `ProcessDocument`, `ConversationAttachment` e mensagem de sistema. Se o banco falhar, o arquivo é removido do bucket.

Tipos de arquivo e limite de 3,5 MB seguem a infraestrutura já publicada. Nesta fase, anexar adiciona contexto e governança, mas não interpreta o conteúdo automaticamente.

## Segurança e governança

- Todas as queries usam `workspaceId` obtido da sessão.
- Toda tool exige `requireProcess` antes da execução.
- Conversa e processo são validados conjuntamente.
- Upload mantém o caminho `workspace/processo/arquivo` no bucket privado.
- As novas tabelas têm RLS habilitada e a app layer continua sendo a fronteira server-side.
- Tools mutáveis reutilizam as regras de análise e plano, sem chamada externa.

## Evolução para LLM e RAG

Uma integração futura deve substituir apenas a seleção/orquestração, preservando as tools determinísticas como fronteira de execução. O modelo não deve acessar o banco diretamente. O fluxo recomendado é: LLM escolhe tool com schema restrito, servidor valida workspace/processo, tool executa, saída é registrada e o LLM redige a resposta.

RAG poderá indexar documentos privados por workspace e processo, com citações para trechos autorizados. OCR e parsing devem produzir artefatos versionados antes de alimentar o contexto. Integrações com Portal Único e sistemas de drawback devem ser tools separadas, auditáveis e com credenciais por workspace.

## Limitações atuais

> O lifecycle operacional, a explicabilidade e os layouts CSV estão detalhados em [deterministic-governance.md](./deterministic-governance.md).

- Não há leitura do conteúdo dos anexos.
- A interpretação de intenção cobre um vocabulário operacional limitado.
- Sugestões são informativas; ainda não há botões para aceitar ou dispensar.
- O histórico não possui paginação.
- Não há streaming de resposta.
- Não há integração com governo, OCR, RAG ou modelo generativo.
