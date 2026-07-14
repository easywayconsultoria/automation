# Layouts versionados e propostas de cadastro

## Contrato de layout

`CsvLayoutDefinition` formaliza nome, tipo, versão, estado ativo, colunas obrigatórias/opcionais, ordem esperada, regras, aliases e descrição. Definições sem `workspaceId` são globais; o modelo permite versões específicas por workspace no futuro.

Layouts iniciais:

| Tipo                | Versão | Cabeçalho                                                                                               |
| ------------------- | ------ | ------------------------------------------------------------------------------------------------------- |
| Portal Único        | 1.0    | `productCode,description,ncm,registrationStatus`                                                        |
| Portal Único legado | 0.9    | `codigo_produto,descricao,ncm,situacao_cadastro`                                                        |
| Drawback            | 1.0    | `referenceCode,productCode,ncm,grantedQuantity,usedQuantity,availableBalance,unit`                      |
| Drawback legado     | 0.9    | `ato_concessorio,codigo_produto,ncm,quantidade_concedida,quantidade_utilizada,saldo_disponivel,unidade` |

## Detecção de versão

A versão é identificada pela assinatura exata e ordenada do cabeçalho. A versão 0.9 converte aliases em português para os nomes canônicos antes da validação de linhas. O import persiste `csvLayoutId` e `detectedVersion`.

Um cabeçalho sem assinatura conhecida resulta em import `FAILED`, versão nula e erro que informa o cabeçalho recebido e as versões suportadas. O documento permanece disponível para reprocessamento posterior.

## Propostas de cadastro

Após parse válido do Portal Único, cada item é avaliado por duas regras:

1. ausência de cadastro ativo (`REGISTERED`, `ATIVO` ou `CADASTRADO`) no CSV detectado;
2. ausência de correspondência válida no catálogo interno usando o matching oficial.

Se qualquer regra disparar, uma `RegistrationProposal` é criada por item, contendo código, descrição, NCM, origem e justificativa. Reprocessamentos atualizam apenas propostas `DRAFT` ou `PENDING_REVIEW`; decisões humanas não são reabertas automaticamente.

## Aprovação humana

O operador pode editar código, descrição e NCM antes de salvar ou aceitar. O fluxo é:

- `PENDING_REVIEW`: editar, aceitar ou dispensar;
- `ACCEPTED`: converter em ação operacional;
- `DISMISSED`: decisão preservada;
- `CONVERTED`: proposta preservada e `SuggestedAction` aceita criada para execução.

Cada revisão cria `RegistrationProposalEvent` com estados, mudanças, ator, data e motivo opcional. O `AuditLog` registra a mesma operação em nível corporativo.

## Segurança

Proposta, item, import, documento e processo são sempre filtrados pelo workspace obtido da sessão. A constraint por workspace/processo/item evita duplicação. As tabelas novas possuem RLS habilitada.

## Limitações

- Detecção exige ordem exata das colunas.
- Apenas versões 1.0 e 0.9 estão ativas.
- Não existe editor administrativo de layouts na UI.
- A conversão cria ação interna; não transmite cadastro ao governo.
- Não há OCR, LLM, RAG ou validação online.
