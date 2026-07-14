import Link from "next/link";
import {
  parseConversationCsv,
  runConversationQuickAction,
  sendConversationMessage,
  transitionSuggestedAction,
  uploadConversationAttachment
} from "@/app/actions/conversation";
import {
  addInvoiceItem,
  classifyInvoiceItem,
  importInvoiceCsv,
  saveDrawback,
  setProcessSupplier,
  uploadProcessDocument
} from "@/app/actions/domain";
import { requireProcess } from "@/lib/auth/context";
import { prisma } from "@/lib/db/prisma";

const severityStyle: Record<string, string> = {
  LOW: "bg-slate-100 text-slate-700",
  MEDIUM: "bg-amber-100 text-amber-800",
  HIGH: "bg-orange-100 text-orange-800",
  CRITICAL: "bg-red-100 text-red-800"
};
export default async function ProcessPage({
  params,
  searchParams
}: {
  params: Promise<{ processId: string }>;
  searchParams: Promise<{ message?: string }>;
}) {
  const { processId } = await params;
  const { workspace } = await requireProcess(processId);
  const [process, catalog, suppliers, conversation] = await Promise.all([
    prisma.importProcess.findFirst({
      where: { id: processId, workspaceId: workspace.id },
      include: {
        documents: { orderBy: { uploadedAt: "desc" } },
        items: {
          orderBy: { lineNumber: "asc" },
          include: { productCatalog: true }
        },
        inconsistencies: {
          orderBy: [{ severity: "desc" }, { createdAt: "desc" }]
        },
        actionPlan: { include: { items: { orderBy: { createdAt: "asc" } } } },
        drawback: true,
        supplier: true
      }
    }),
    prisma.productCatalog.findMany({
      where: { workspaceId: workspace.id, active: true },
      orderBy: { internalCode: "asc" }
    }),
    prisma.supplier.findMany({
      where: { workspaceId: workspace.id, active: true },
      orderBy: { name: "asc" }
    }),
    prisma.conversation.findFirst({
      where: { workspaceId: workspace.id, importProcessId: processId },
      include: {
        messages: { orderBy: { createdAt: "asc" }, take: 100 },
        attachments: {
          orderBy: { createdAt: "desc" },
          take: 20,
          include: {
            processDocument: {
              include: { portalCsvImports: true, drawbackCsvImports: true }
            }
          }
        },
        suggestedActions: {
          orderBy: { createdAt: "desc" },
          take: 12
        }
      }
    })
  ]);
  if (!process || !conversation) return null;
  const { message } = await searchParams;
  return (
    <>
      <Link
        href="/workspace/processes"
        className="text-sm text-brand hover:underline"
      >
        ← Voltar para processos
      </Link>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-brand">
            {process.reference}
          </p>
          <h1 className="mt-1 text-3xl font-semibold">{process.clientName}</h1>
          <p className="mt-2 text-slate-600">
            {process.exporterName ?? "Exportador não informado"} ·{" "}
            {process.invoiceNumber ?? "Invoice não informada"}
          </p>
        </div>
        <span className="rounded-full bg-emerald-100 px-4 py-2 text-xs font-bold text-emerald-800">
          IA CORPORATIVA · DETERMINÍSTICA
        </span>
      </div>
      {message && (
        <p className="mt-5 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </p>
      )}
      <section className="mt-6 grid min-h-[680px] gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-h-[680px] flex-col overflow-hidden rounded-2xl border bg-white shadow-sm">
          <div className="border-b bg-ink px-6 py-4 text-white">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">
              Conversa do processo
            </p>
            <h2 className="mt-1 font-semibold">
              {conversation.title ?? process.reference}
            </h2>
          </div>
          <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50/70 p-5">
            {!conversation.messages.length && (
              <div className="mx-auto max-w-xl rounded-xl border border-dashed bg-white p-6 text-center text-sm text-slate-500">
                Converse com este processo. Posso resumir o caso, executar a
                análise e organizar os próximos passos.
              </div>
            )}
            {conversation.messages.map((item) => (
              <article
                key={item.id}
                className={
                  item.role === "USER"
                    ? "ml-auto max-w-[82%] rounded-2xl rounded-br-sm bg-brand px-4 py-3 text-sm text-white"
                    : item.role === "TOOL"
                      ? "mx-auto w-fit rounded-full border bg-white px-3 py-1.5 text-xs font-semibold text-slate-500"
                      : item.role === "SYSTEM"
                        ? "mx-auto max-w-[90%] text-center text-xs text-slate-500"
                        : "max-w-[88%] rounded-2xl rounded-bl-sm border bg-white px-4 py-3 text-sm text-slate-700 shadow-sm"
                }
              >
                {item.role === "ASSISTANT" && (
                  <p className="mb-1 text-xs font-bold text-brand">
                    EasyWay IA
                  </p>
                )}
                <p className="whitespace-pre-wrap">{item.content}</p>
                {item.role === "ASSISTANT" && item.structuredData && (
                  <details className="mt-3 rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
                    <summary className="cursor-pointer font-semibold text-brand">
                      Por que esta resposta?
                    </summary>
                    <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap font-sans">
                      {JSON.stringify(item.structuredData, null, 2)}
                    </pre>
                  </details>
                )}
                <time
                  className={`mt-2 block text-[10px] ${item.role === "USER" ? "text-emerald-100" : "text-slate-400"}`}
                >
                  {item.createdAt.toLocaleString("pt-BR")}
                </time>
              </article>
            ))}
          </div>
          <div className="border-t bg-white p-4">
            <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
              {[
                ["summarize_process", "Resumir processo"],
                ["list_inconsistencies", "Ver inconsistências"],
                ["run_analysis", "Rodar análise"],
                ["generate_action_plan", "Gerar plano"],
                ["list_unmatched_items", "Itens sem classificação"],
                ["summarize_drawback", "Resumo de drawback"],
                ["summarize_drawback_balances", "Saldos drawback"],
                ["summarize_portal_data", "Dados do Portal"],
                ["identify_portal_registration_gaps", "Lacunas no Portal"],
                ["summarize_drawback_coverage", "Cobertura drawback"]
              ].map(([toolName, label]) => (
                <form action={runConversationQuickAction} key={toolName}>
                  <input type="hidden" name="processId" value={process.id} />
                  <input type="hidden" name="toolName" value={toolName} />
                  <button className="whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold hover:border-brand hover:text-brand">
                    {label}
                  </button>
                </form>
              ))}
            </div>
            <form
              action={sendConversationMessage}
              className="flex items-end gap-3"
            >
              <input type="hidden" name="processId" value={process.id} />
              <textarea
                name="content"
                required
                rows={2}
                placeholder="Pergunte sobre este processo ou peça uma ação operacional…"
                className="min-h-14 flex-1 resize-none rounded-xl border px-4 py-3 text-sm"
              />
              <button className="rounded-xl bg-brand px-5 py-3 font-semibold text-white">
                Enviar
              </button>
            </form>
          </div>
        </div>
        <aside className="space-y-4">
          <ContextCard
            title="Estado do caso"
            value={`${process.inconsistencies.filter((item) => item.status === "OPEN").length} inconsistências abertas`}
            detail={`${process.items.length} itens · ${process.documents.length} documentos`}
          />
          <ContextCard
            title="Plano de ação"
            value={process.actionPlan?.status ?? "Não gerado"}
            detail={
              process.actionPlan?.summary ?? "Peça à IA para gerar o plano."
            }
          />
          <ContextCard
            title="Drawback"
            value={process.drawback?.status ?? "Não cadastrado"}
            detail={process.drawback?.mode ?? "Sem modalidade"}
          />
          <div className="rounded-xl border bg-white p-4">
            <h3 className="font-semibold">Anexar ao contexto</h3>
            <form
              action={uploadConversationAttachment}
              className="mt-3 space-y-3"
            >
              <input type="hidden" name="processId" value={process.id} />
              <select
                name="kind"
                className="w-full rounded-lg border px-3 py-2 text-sm"
              >
                <option value="INVOICE">Invoice</option>
                <option value="PORTAL_UNICO_CSV">CSV Portal Único</option>
                <option value="DRAWBACK_CSV">CSV Drawback</option>
                <option value="OTHER">Arquivo de apoio</option>
              </select>
              <input
                type="file"
                name="file"
                required
                accept=".pdf,.csv,.txt,.png,.jpg,.jpeg"
                className="block w-full text-xs"
              />
              <button className="w-full rounded-lg bg-ink px-3 py-2 text-sm font-semibold text-white">
                Adicionar arquivo
              </button>
            </form>
            <div className="mt-4 space-y-2">
              {conversation.attachments.slice(0, 5).map((attachment) => (
                <div
                  key={attachment.id}
                  className="rounded-lg bg-slate-50 px-3 py-2"
                >
                  <p className="truncate text-xs font-semibold">
                    {attachment.label}
                  </p>
                  <p className="text-[10px] text-slate-500">
                    {attachment.kind}
                  </p>
                  {(attachment.kind === "PORTAL_UNICO_CSV" ||
                    attachment.kind === "DRAWBACK_CSV") && (
                    <form action={parseConversationCsv} className="mt-2">
                      <input
                        type="hidden"
                        name="processId"
                        value={process.id}
                      />
                      <input
                        type="hidden"
                        name="attachmentId"
                        value={attachment.id}
                      />
                      <button className="text-[11px] font-semibold text-brand hover:underline">
                        {attachment.processDocument?.portalCsvImports.length ||
                        attachment.processDocument?.drawbackCsvImports.length
                          ? "Reprocessar CSV"
                          : "Processar CSV"}
                      </button>
                    </form>
                  )}
                </div>
              ))}
            </div>
          </div>
          {conversation.suggestedActions.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <h3 className="font-semibold text-amber-900">Ações sugeridas</h3>
              <div className="mt-3 space-y-3">
                {conversation.suggestedActions.map((action) => (
                  <div key={action.id}>
                    <p className="text-sm font-semibold text-amber-900">
                      {action.title}
                    </p>
                    <p className="mt-1 text-xs text-amber-800">
                      {action.description}
                    </p>
                    <p className="mt-1 text-[10px] font-bold text-amber-700">
                      {action.status}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(action.status === "OPEN"
                        ? [
                            ["ACCEPTED", "Aceitar"],
                            ["DISMISSED", "Dispensar"]
                          ]
                        : action.status === "ACCEPTED"
                          ? [
                              ["COMPLETED", "Concluir"],
                              ["DISMISSED", "Dispensar"],
                              ["OPEN", "Reabrir"]
                            ]
                          : [["OPEN", "Reabrir"]]
                      ).map(([status, label]) => (
                        <form action={transitionSuggestedAction} key={status}>
                          <input
                            type="hidden"
                            name="processId"
                            value={process.id}
                          />
                          <input
                            type="hidden"
                            name="actionId"
                            value={action.id}
                          />
                          <input type="hidden" name="toStatus" value={status} />
                          <button className="rounded border border-amber-300 bg-white px-2 py-1 text-[10px] font-semibold text-amber-900">
                            {label}
                          </button>
                        </form>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>
      </section>
      <form
        action={setProcessSupplier}
        className="mt-5 flex flex-wrap items-end gap-3 rounded-xl border bg-white p-4"
      >
        <input type="hidden" name="processId" value={process.id} />
        <label className="min-w-64 flex-1 text-sm font-medium">
          Fornecedor do processo
          <select
            name="supplierId"
            defaultValue={process.supplierId ?? ""}
            className="mt-2 w-full rounded-lg border px-3 py-2"
          >
            <option value="">Não definido — aliases globais</option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
          </select>
        </label>
        <button className="rounded-lg border px-4 py-2 text-sm font-semibold">
          Atualizar fornecedor
        </button>
        {process.supplier && (
          <span className="pb-2 text-xs text-slate-500">
            Contexto atual: {process.supplier.name}
          </span>
        )}
      </form>
      <p className="mt-12 text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
        Detalhes operacionais
      </p>
      <nav className="mt-3 flex gap-4 overflow-x-auto border-b text-sm font-medium">
        <a href="#items" className="pb-3">
          Itens
        </a>
        <a href="#documents" className="pb-3">
          Documentos
        </a>
        <a href="#inconsistencies" className="pb-3">
          Inconsistências
        </a>
        <a href="#plan" className="pb-3">
          Plano
        </a>
        <a href="#drawback" className="pb-3">
          Drawback
        </a>
      </nav>
      <section id="items" className="mt-8">
        <SectionTitle
          title="Itens da invoice"
          subtitle={`${process.items.length} itens cadastrados`}
        />
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                {[
                  "Linha",
                  "Código",
                  "Descrição",
                  "NCM",
                  "Qtd.",
                  "Preço",
                  "Total",
                  "Classificação"
                ].map((h) => (
                  <th key={h} className="px-4 py-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {process.items.map((item) => (
                <tr key={item.id} className="border-t">
                  <td className="px-4 py-3">{item.lineNumber}</td>
                  <td className="px-4 py-3">{item.supplierCode ?? "—"}</td>
                  <td className="max-w-xs px-4 py-3">{item.description}</td>
                  <td className="px-4 py-3">{item.ncm ?? "—"}</td>
                  <td className="px-4 py-3">{item.quantity.toString()}</td>
                  <td className="px-4 py-3">{item.unitPrice.toString()}</td>
                  <td className="px-4 py-3">
                    {item.totalPrice.toString()} {item.currency}
                  </td>
                  <td className="min-w-72 px-4 py-3">
                    {item.productCatalog && (
                      <p className="mb-2 text-xs font-semibold text-emerald-700">
                        {item.productCatalog.internalCode} ·{" "}
                        {item.productCatalog.description}
                      </p>
                    )}
                    {catalog.length ? (
                      <form action={classifyInvoiceItem} className="space-y-2">
                        <input
                          type="hidden"
                          name="processId"
                          value={process.id}
                        />
                        <input type="hidden" name="itemId" value={item.id} />
                        <select
                          name="productCatalogId"
                          defaultValue={item.productCatalogId ?? ""}
                          required
                          className="w-full rounded-lg border px-2 py-1.5 text-xs"
                        >
                          <option value="">Selecionar produto</option>
                          {catalog.map((product) => (
                            <option key={product.id} value={product.id}>
                              {product.internalCode} · {product.description}
                            </option>
                          ))}
                        </select>
                        <label className="flex items-center gap-2 text-xs text-slate-600">
                          <input type="checkbox" name="createAlias" /> Criar
                          alias com os dados deste item
                        </label>
                        <button className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white">
                          Vincular
                        </button>
                      </form>
                    ) : (
                      <Link
                        href="/workspace/catalog"
                        className="text-xs font-semibold text-brand hover:underline"
                      >
                        Criar produto no catálogo
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
              {!process.items.length && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-8 text-center text-slate-500"
                  >
                    Nenhum item.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <ItemForm processId={process.id} />
          <CsvForm processId={process.id} />
        </div>
      </section>
      <section id="documents" className="mt-12">
        <SectionTitle
          title="Documentos"
          subtitle="Arquivos privados vinculados ao processo"
        />
        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <div className="space-y-2">
            {process.documents.map((doc) => (
              <div
                key={doc.id}
                className="flex justify-between rounded-lg border bg-white px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium">{doc.fileName}</p>
                  <p className="text-xs text-slate-500">
                    {doc.type} · {doc.status}
                  </p>
                </div>
                <span className="text-xs text-slate-500">
                  {doc.uploadedAt.toLocaleDateString("pt-BR")}
                </span>
              </div>
            ))}
            {!process.documents.length && (
              <p className="rounded-lg border border-dashed bg-white p-6 text-sm text-slate-500">
                Nenhum documento.
              </p>
            )}
          </div>
          <DocumentForm processId={process.id} />
        </div>
      </section>
      <section id="inconsistencies" className="mt-12">
        <SectionTitle
          title="Inconsistências"
          subtitle={`${process.inconsistencies.filter((i) => i.status === "OPEN").length} abertas`}
        />
        <div className="space-y-3">
          {process.inconsistencies.map((item) => (
            <article key={item.id} className="rounded-xl border bg-white p-5">
              <div className="flex justify-between gap-3">
                <h3 className="font-semibold">{item.title}</h3>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-bold ${severityStyle[item.severity]}`}
                >
                  {item.severity}
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-600">{item.description}</p>
              <p className="mt-3 text-xs text-slate-500">
                {item.type} · {item.status}
              </p>
            </article>
          ))}
          {!process.inconsistencies.length && (
            <p className="rounded-lg border border-dashed bg-white p-6 text-sm text-slate-500">
              Rode a análise para verificar o processo.
            </p>
          )}
        </div>
      </section>
      <section id="plan" className="mt-12">
        <SectionTitle
          title="Plano de ação"
          subtitle={process.actionPlan?.summary ?? "Ainda não gerado"}
        />
        <div className="space-y-3">
          {process.actionPlan?.items.map((item) => (
            <article key={item.id} className="rounded-xl border bg-white p-5">
              <div className="flex justify-between">
                <h3 className="font-semibold">{item.title}</h3>
                <span className="text-xs font-bold text-brand">
                  {item.priority}
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-600">{item.description}</p>
              <p className="mt-3 text-xs text-slate-500">{item.status}</p>
            </article>
          ))}
          {!process.actionPlan?.items.length && (
            <p className="rounded-lg border border-dashed bg-white p-6 text-sm text-slate-500">
              Gere o plano após executar a análise.
            </p>
          )}
        </div>
      </section>
      <section id="drawback" className="mt-12">
        <SectionTitle
          title="Drawback"
          subtitle={
            process.drawback
              ? `${process.drawback.mode} · ${process.drawback.status}`
              : "Cadastro inicial"
          }
        />
        <form
          action={saveDrawback}
          className="grid gap-4 rounded-xl border bg-white p-6 md:grid-cols-2"
        >
          <input type="hidden" name="processId" value={process.id} />
          <label className="text-sm font-medium">
            Modalidade
            <select
              name="mode"
              defaultValue={process.drawback?.mode ?? "ISENCAO"}
              className="mt-2 w-full rounded-lg border px-3 py-2"
            >
              <option value="ISENCAO">Isenção</option>
              <option value="SUSPENSAO">Suspensão</option>
            </select>
          </label>
          <Field
            name="referenceCode"
            label="Referência"
            defaultValue={process.drawback?.referenceCode ?? ""}
          />
          <label className="text-sm font-medium md:col-span-2">
            Observações
            <textarea
              name="notes"
              defaultValue={process.drawback?.notes ?? ""}
              rows={3}
              className="mt-2 w-full rounded-lg border px-3 py-2"
            />
          </label>
          <button className="rounded-lg bg-brand px-4 py-2.5 font-semibold text-white md:w-fit">
            Salvar drawback
          </button>
        </form>
      </section>
    </>
  );
}

function SectionTitle({
  title,
  subtitle
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mb-4">
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
    </div>
  );
}
function ContextCard({
  title,
  value,
  detail
}: {
  title: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="rounded-xl border bg-white p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
        {title}
      </p>
      <p className="mt-2 font-semibold">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </article>
  );
}
function Field({
  label,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="text-sm font-medium">
      {label}
      <input {...props} className="mt-2 w-full rounded-lg border px-3 py-2" />
    </label>
  );
}
function ItemForm({ processId }: { processId: string }) {
  return (
    <form
      action={addInvoiceItem}
      className="grid gap-3 rounded-xl border bg-white p-5 sm:grid-cols-2"
    >
      <input type="hidden" name="processId" value={processId} />
      <h3 className="font-semibold sm:col-span-2">Adicionar item manual</h3>
      <Field name="lineNumber" label="Linha *" type="number" min="1" required />
      <Field name="supplierCode" label="Código fornecedor" />
      <label className="text-sm font-medium sm:col-span-2">
        Descrição *
        <input
          name="description"
          required
          className="mt-2 w-full rounded-lg border px-3 py-2"
        />
      </label>
      <Field name="ncm" label="NCM" />
      <Field name="unit" label="Unidade" />
      <Field
        name="quantity"
        label="Quantidade *"
        type="number"
        step="any"
        required
      />
      <Field
        name="unitPrice"
        label="Preço unitário *"
        type="number"
        step="any"
        required
      />
      <Field
        name="totalPrice"
        label="Preço total *"
        type="number"
        step="any"
        required
      />
      <Field name="currency" label="Moeda" defaultValue="USD" />
      <button className="rounded-lg bg-brand px-4 py-2.5 font-semibold text-white sm:col-span-2">
        Adicionar item
      </button>
    </form>
  );
}
function CsvForm({ processId }: { processId: string }) {
  return (
    <form
      action={importInvoiceCsv}
      className="h-fit space-y-4 rounded-xl border bg-white p-5"
    >
      <input type="hidden" name="processId" value={processId} />
      <h3 className="font-semibold">Importar CSV</h3>
      <p className="text-sm text-slate-600">
        Layout documentado em <code>docs/invoice-items.csv</code>. Máximo 1 MB.
      </p>
      <input
        type="file"
        name="csv"
        accept=".csv,text/csv"
        required
        className="block w-full text-sm"
      />
      <button className="rounded-lg bg-ink px-4 py-2.5 font-semibold text-white">
        Importar itens
      </button>
    </form>
  );
}
function DocumentForm({ processId }: { processId: string }) {
  return (
    <form
      action={uploadProcessDocument}
      className="h-fit space-y-4 rounded-xl border bg-white p-5"
    >
      <input type="hidden" name="processId" value={processId} />
      <h3 className="font-semibold">Enviar documento</h3>
      <select
        name="type"
        className="w-full rounded-lg border px-3 py-2 text-sm"
      >
        <option value="INVOICE">Invoice</option>
        <option value="PACKING_LIST">Packing list</option>
        <option value="DECLARATION">Declaração</option>
        <option value="SUPPORT_DOC">Documento de apoio</option>
        <option value="OTHER">Outro</option>
      </select>
      <input
        type="file"
        name="file"
        accept=".pdf,.csv,.txt,.png,.jpg,.jpeg"
        required
        className="block w-full text-sm"
      />
      <p className="text-xs text-slate-500">
        PDF, CSV, texto ou imagem. Máximo 3,5 MB.
      </p>
      <button className="rounded-lg bg-brand px-4 py-2.5 font-semibold text-white">
        Enviar arquivo
      </button>
    </form>
  );
}
