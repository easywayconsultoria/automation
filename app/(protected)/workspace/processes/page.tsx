import Link from "next/link";
import { createImportProcess } from "@/app/actions/domain";
import { requireWorkspace } from "@/lib/auth/context";
import { prisma } from "@/lib/db/prisma";

const status: Record<string, string> = {
  DRAFT: "Rascunho",
  IN_REVIEW: "Em revisão",
  PENDING_ACTION: "Ação pendente",
  COMPLIANT: "Conforme",
  CLOSED: "Encerrado"
};
export default async function ProcessesPage({
  searchParams
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const { workspace } = await requireWorkspace();
  const [processes, suppliers] = await Promise.all([
    prisma.importProcess.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: "desc" },
      include: {
        supplier: true,
        _count: {
          select: { items: true, inconsistencies: true, documents: true }
        }
      }
    }),
    prisma.supplier.findMany({
      where: { workspaceId: workspace.id, active: true },
      orderBy: { name: "asc" }
    })
  ]);
  const { message } = await searchParams;
  return (
    <>
      <div className="mb-8">
        <p className="text-sm font-semibold text-brand">Processos</p>
        <h1 className="mt-1 text-3xl font-semibold">Importações</h1>
        <p className="mt-2 text-slate-600">
          Cadastre e acompanhe a conferência de cada operação.
        </p>
      </div>
      {message && (
        <p className="mb-5 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {message}
        </p>
      )}
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <section className="space-y-3">
          {processes.length ? (
            processes.map((process) => (
              <Link
                key={process.id}
                href={`/workspace/processes/${process.id}`}
                className="block rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-brand"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold">{process.reference}</p>
                    <p className="mt-1 text-sm text-slate-600">
                      {process.clientName}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Fornecedor: {process.supplier?.name ?? "não definido"}
                    </p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium">
                    {status[process.status]}
                  </span>
                </div>
                <p className="mt-4 text-xs text-slate-500">
                  {process._count.items} itens · {process._count.documents}{" "}
                  documentos · {process._count.inconsistencies} inconsistências
                </p>
              </Link>
            ))
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
              Nenhum processo cadastrado.
            </div>
          )}
        </section>
        <form
          action={createImportProcess}
          className="h-fit space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <h2 className="text-lg font-semibold">Novo processo</h2>
          <Field
            name="reference"
            label="Referência *"
            required
            placeholder="IMP-2026-001"
          />
          <Field name="clientName" label="Cliente *" required />
          <Field name="exporterName" label="Exportador" />
          <label className="block text-sm font-medium text-slate-700">
            Fornecedor
            <select
              name="supplierId"
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2"
            >
              <option value="">Não definido</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <Field name="originCountry" label="País de origem" />
            <Field name="incoterm" label="Incoterm" />
          </div>
          <Field name="invoiceNumber" label="Invoice" />
          <label className="block text-sm font-medium text-slate-700">
            Observações
            <textarea
              name="notes"
              rows={3}
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <button className="w-full rounded-lg bg-brand px-4 py-3 font-semibold text-white">
            Criar processo
          </button>
        </form>
      </div>
    </>
  );
}
function Field(
  props: React.InputHTMLAttributes<HTMLInputElement> & { label: string }
) {
  const { label, ...input } = props;
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <input
        {...input}
        className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2"
      />
    </label>
  );
}
