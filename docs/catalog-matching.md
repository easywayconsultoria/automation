# Catálogo e matching operacional

## Gestão do catálogo

A área autenticada `/workspace/catalog` lista, busca, cria e edita produtos do workspace. A busca cobre código interno, descrição e NCM. Produtos podem ser ativados ou desativados; produtos inativos permanecem no histórico, mas não participam de novos matches nem podem receber um vínculo manual.

Cada produto possui código interno, descrição, NCM, unidade padrão e estado ativo. O código interno é único por workspace.

## Gestão de aliases

Na mesma área, aliases podem ser buscados por código ou descrição do fornecedor, criados e editados. Todo alias aponta para um produto do mesmo workspace e deve informar ao menos código ou descrição. `confidenceHint` aceita valores entre 0 e 1 e é apenas informativo nesta etapa.

Aliases com o mesmo código normalizado ou a mesma descrição normalizada são rejeitados dentro do mesmo escopo: global ou fornecedor específico. O mesmo código pode representar produtos diferentes em fornecedores diferentes sem criar ambiguidade.

## Regras de matching

O matching é determinístico e usa somente produtos ativos. Textos são normalizados em maiúsculas, sem acentos, com pontuação convertida em espaço e espaços repetidos removidos. A prioridade é:

1. vínculo manual já salvo em `InvoiceItem.productCatalogId`;
2. alias do fornecedor do processo com código e descrição normalizados iguais;
3. alias do fornecedor do processo com código normalizado igual;
4. alias do fornecedor do processo com descrição normalizada igual;
5. alias global com código e descrição normalizados iguais;
6. alias global com código normalizado igual;
7. alias global com descrição normalizada igual;
8. código interno do produto igual ao código do fornecedor;
9. sem correspondência explícita.

Não há similaridade aproximada, modelo de IA ou inferência não auditável.

## Vínculo manual a partir do item

No detalhe do processo, cada item pode ser associado a um produto ativo. A opção “Criar alias com os dados deste item” cria, na mesma transação, um alias com o código e a descrição do fornecedor e confiança informativa `1`. Se o processo possui fornecedor, o alias é específico dele; caso contrário, é global. Se uma chave equivalente já existir no mesmo escopo, o vínculo é salvo sem duplicar o alias.

As ações são registradas em auditoria como `invoice_item_classified`; criação e edição no catálogo também geram eventos próprios.

## Efeito nas inconsistências

O vínculo manual resolve imediatamente inconsistências abertas `CATALOG_NOT_FOUND` do item. Ao rodar novamente a análise, um match válido por vínculo, alias ou código impede que essa inconsistência seja recriada.

A análise remove e recalcula apenas inconsistências abertas geradas pelo sistema. Inconsistências aceitas, dispensadas ou resolvidas são preservadas, assim como todas as regras não relacionadas a catálogo. Dessa forma não há duplicidade de inconsistências abertas após uma reanálise.

## Segurança e isolamento

Todas as consultas e mutações incluem `workspaceId` obtido no servidor a partir da sessão. Produtos de destino são validados novamente no servidor. A camada da aplicação complementa as políticas RLS já habilitadas; nenhum identificador enviado pelo navegador concede acesso a outro workspace.

## Limitações atuais

- Não há exclusão de produto ou alias; a desativação do produto preserva histórico.
- A criação de um produto diretamente dentro da linha do item não foi incluída; o usuário cria o produto no catálogo e volta ao processo.
- `confidenceHint` não muda a prioridade do matching.
- O match automático não grava o produto no item; ele é recalculado de forma determinística durante a análise. O vínculo manual é persistido.

## Próximos passos naturais

Depois da maturidade operacional e de dados suficientes, OCR/parsing pode alimentar os mesmos campos de item. Matching mais inteligente pode adicionar índices normalizados persistidos para aliases, sugestões aproximadas e revisão humana, mantendo a prioridade do vínculo manual e a trilha de auditoria.
