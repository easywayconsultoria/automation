# Governança determinística, sugestões e CSVs

## Lifecycle de SuggestedAction

Estados suportados: `OPEN`, `ACCEPTED`, `DISMISSED` e `COMPLETED`. Transições válidas:

- aberta → aceita ou dispensada;
- aceita → concluída, dispensada ou reaberta;
- dispensada → reaberta;
- concluída → reaberta.

Cada mudança cria `SuggestedActionEvent` com estado anterior, novo estado, ator, data e motivo opcional, além do evento no `AuditLog`. IDs de ação, processo e workspace são validados no servidor.

## Explicabilidade

Toda resposta produzida pelo orquestrador inclui em `structuredData` critérios, fontes, regras disparadas e limitações. `ToolExecution` persiste os mesmos elementos separadamente em `criteria`, `sources` e `limitations`. A UI expõe “Por que esta resposta?” dentro da mensagem.

As conclusões consideram apenas dados persistidos no processo. Não há consulta governamental em tempo real, OCR, LLM ou matching aproximado.

## CSV do Portal Único

Layout inicial, codificação UTF-8, delimitador vírgula:

```csv
productCode,description,ncm,registrationStatus
PROD-001,Produto de exemplo,84713012,CADASTRADO
```

Campos obrigatórios: `productCode`, `description`, `registrationStatus`. `ncm` é opcional. Estados reconhecidos como cadastro ativo nas comparações: `REGISTERED`, `ATIVO` e `CADASTRADO`.

O parser valida o cabeçalho e cada linha. Erros armazenam número da linha e mensagem. Linhas válidas são persistidas mesmo quando outras falham. Reprocessar o mesmo documento atualiza o import e substitui suas linhas anteriores.

## CSV de drawback

```csv
referenceCode,productCode,ncm,grantedQuantity,usedQuantity,availableBalance,unit
DB-2026-01,PROD-001,84713012,1000,250,750,UN
```

`referenceCode`, `productCode` e os três valores quantitativos são obrigatórios. Quantidades devem ser numéricas. `ncm` e `unit` são opcionais. O saldo é usado como informado no arquivo; nesta fase não é recalculado nem validado contra fonte externa.

## Tools adicionadas

- `parse_portal_csv` e `parse_drawback_csv`, acionadas no anexo;
- `summarize_portal_data`;
- `summarize_drawback_balances`;
- `compare_process_items_with_portal_data`;
- `identify_portal_registration_gaps`;
- `suggest_product_registration_actions`;
- `summarize_drawback_coverage`.

Comparações usam `supplierCode` do item contra `productCode` do CSV, normalizados por caixa e espaços. Lacunas e insuficiência de saldo geram sugestões específicas por código ou linha.

## Segurança e limitações

O arquivo permanece no bucket privado. O parse faz download server-side após `requireProcess` e valida novamente attachment, documento, workspace e processo. Imports e linhas possuem filtros e FKs de workspace/processo, além de RLS habilitada.

Ainda não há suporte a ponto e vírgula, layouts governamentais alternativos, decimais com vírgula, versionamento formal de layout, OCR, RAG, LLM ou integração online.

## Caminho futuro

Antes de ativar LLM, recomenda-se adicionar detecção explícita de versão do layout, testes com amostras reais anonimizadas e aprovação humana para gerar cadastro. Depois disso, um LLM poderá redigir explicações e sugestões usando apenas tools auditáveis, sem acesso direto ao banco ou às credenciais governamentais.
