import Link from "next/link";
import {
  addInvoiceItem,
  generateActionPlan,
  importInvoiceCsv,
  runProcessAnalysis,
  saveDrawback,
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
  const process = await prisma.importProcess.findFirst({
    where: { id: processId, workspaceId: workspace.id },
    include: {
      documents: { orderBy: { uploadedAt: "desc" } },
      items: { orderBy: { lineNumber: "asc" } },
      inconsistencies: {
        orderBy: [{ severity: "desc" }, { createdAt: "desc" }]
      },
      actionPlan: { include: { items: { orderBy: { createdAt: "asc" } } } },
      drawback: true
    }
  });
  if (!process) return null;
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
        <div className="flex gap-2">
          <form action={runProcessAnalysis}>
            <input type="hidden" name="processId" value={process.id} />
            <button className="rounded-lg bg-ink px-4 py-2.5 text-sm font-semibold text-white">
              Rodar análise
            </button>
          </form>
          <form action={generateActionPlan}>
            <input type="hidden" name="processId" value={process.id} />
            <button className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white">
              Gerar plano
            </button>
          </form>
        </div>
      </div>
      {message && (
        <p className="mt-5 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </p>
      )}
      <nav className="mt-8 flex gap-4 overflow-x-auto border-b text-sm font-medium">
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
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                {[
                  "Linha",
                  "Código",
                  "Descrição",
                  "NCM",
                  "Qtd.",
                  "Preço",
                  "Total"
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
                </tr>
              ))}
              {!process.items.length && (
                <tr>
                  <td
                    colSpan={7}
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
