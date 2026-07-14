# Fornecedores e qualidade de classificação

## Modelo Supplier

`Supplier` pertence a um workspace e possui nome, nome normalizado, código externo opcional, país e estado ativo. O nome normalizado remove acentos, diferenças de caixa, pontuação e espaços repetidos. Há unicidade de `workspaceId + normalizedName`; a aplicação também impede código externo repetido sem diferenciar maiúsculas e minúsculas.

`ImportProcess.supplierId` é opcional e usa `ON DELETE SET NULL`. `ProductAlias.supplierId` também é opcional: `null` significa alias global; um UUID significa alias específico daquele fornecedor. A desativação impede novas associações, mas preserva processos históricos e seus matches.

## Gestão operacional

A rota autenticada `/workspace/suppliers` oferece busca, criação, edição, ativação e desativação, além das contagens de processos e aliases. O fornecedor pode ser escolhido ao criar o processo ou alterado no detalhe de um processo existente.

Toda escrita valida no servidor que processo, fornecedor, produto e alias pertencem ao workspace da sessão. Os eventos `supplier_created`, `supplier_updated`, `supplier_status_changed` e `process_supplier_changed` compõem a auditoria.

## Alias global e específico

- Global: usado por processos sem fornecedor e como fallback para qualquer fornecedor.
- Específico: avaliado apenas quando seu `supplierId` é o mesmo do processo e sempre antes do fallback global.

Colisões de código ou descrição normalizados são proibidas dentro do mesmo escopo. Elas são permitidas entre fornecedores diferentes e entre escopo específico e global, pois a prioridade elimina ambiguidade.

## Métricas operacionais

O dashboard calcula em tempo real, com o mesmo motor determinístico da análise:

- total de itens;
- itens com match válido;
- itens sem correspondência;
- taxa de correspondência geral;
- taxa e volume por processo;
- taxa e volume por fornecedor, incluindo “Sem fornecedor”;
- aliases globais;
- aliases específicos.

Um item classificado é aquele para o qual `matchInvoiceItem` encontra vínculo manual, alias contextual/global ou código interno ativo. Assim, dashboard e `CATALOG_NOT_FOUND` usam a mesma definição.

## Limitações atuais

- O fornecedor é herdado do processo; não há override por item.
- Alterar o fornecedor não roda a análise automaticamente; o usuário deve reanalisar.
- Métricas refletem o estado atual do catálogo, não um snapshot histórico.
- Não há fuzzy matching, OCR, parsing avançado ou IA.
- A normalização de aliases ocorre em runtime; apenas o nome do fornecedor possui coluna normalizada persistida.

## Próximos passos antes de OCR

Os próximos avanços naturais são versionar decisões de matching, registrar o critério usado em cada análise, criar fila de revisão para itens não classificados e adicionar índices normalizados persistidos aos aliases. Essas melhorias aumentam auditabilidade antes de ampliar a ingestão documental.
