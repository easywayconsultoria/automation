import {
  createSupplier,
  toggleSupplier,
  updateSupplier
} from "@/app/actions/domain";
import { requireWorkspace } from "@/lib/auth/context";
import { prisma } from "@/lib/db/prisma";

export default async function SuppliersPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string; message?: string }>;
}) {
  const { workspace } = await requireWorkspace();
  const { q = "", message } = await searchParams;
  const suppliers = await prisma.supplier.findMany({
    where: {
      workspaceId: workspace.id,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { externalCode: { contains: q, mode: "insensitive" } },
              { country: { contains: q, mode: "insensitive" } }
            ]
          }
        : {})
    },
    include: { _count: { select: { aliases: true, processes: true } } },
    orderBy: [{ active: "desc" }, { name: "asc" }]
  });
  return (
    <>
      <p className="text-sm font-semibold text-brand">Governança de matching</p>
      <h1 className="mt-1 text-3xl font-semibold">Fornecedores</h1>
      <p className="mt-2 text-slate-600">
        Contexto operacional usado por processos e aliases específicos.
      </p>
      {message && (
        <p className="mt-5 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </p>
      )}
      <div className="mt-8 grid gap-5 xl:grid-cols-[360px_1fr]">
        <SupplierForm />
        <div>
          <form className="flex gap-2">
            <input
              name="q"
              defaultValue={q}
              placeholder="Buscar nome, código ou país"
              className="w-full rounded-lg border bg-white px-4 py-2.5 text-sm"
            />
            <button className="rounded-lg border bg-white px-4 py-2 text-sm font-semibold">
              Buscar
            </button>
          </form>
          <div className="mt-3 space-y-3">
            {suppliers.map((supplier) => (
              <details
                key={supplier.id}
                className="rounded-xl border bg-white p-5"
              >
                <summary className="cursor-pointer list-none">
                  <div className="flex justify-between gap-3">
                    <div>
                      <p className="font-semibold">{supplier.name}</p>
                      <p className="mt-1 text-sm text-slate-500">
                        {supplier.externalCode ?? "Sem código"} ·{" "}
                        {supplier.country ?? "País não informado"} ·{" "}
                        {supplier._count.processes} processos ·{" "}
                        {supplier._count.aliases} aliases
                      </p>
                    </div>
                    <span
                      className={`h-fit rounded-full px-3 py-1 text-xs font-bold ${supplier.active ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}
                    >
                      {supplier.active ? "ATIVO" : "INATIVO"}
                    </span>
                  </div>
                </summary>
                <div className="mt-5 border-t pt-5">
                  <SupplierForm supplier={supplier} />
                  <form action={toggleSupplier} className="mt-3">
                    <input
                      type="hidden"
                      name="supplierId"
                      value={supplier.id}
                    />
                    <button className="text-sm font-semibold text-brand hover:underline">
                      {supplier.active
                        ? "Desativar fornecedor"
                        : "Ativar fornecedor"}
                    </button>
                  </form>
                </div>
              </details>
            ))}
            {!suppliers.length && (
              <p className="rounded-lg border border-dashed bg-white p-6 text-sm text-slate-500">
                Nenhum fornecedor encontrado.
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

type SupplierValue = {
  id: string;
  name: string;
  externalCode: string | null;
  country: string | null;
};
function SupplierForm({ supplier }: { supplier?: SupplierValue }) {
  return (
    <form
      action={supplier ? updateSupplier : createSupplier}
      className="grid gap-3 rounded-xl border bg-white p-5"
    >
      {supplier && (
        <input type="hidden" name="supplierId" value={supplier.id} />
      )}
      <h2 className="font-semibold">
        {supplier ? "Editar fornecedor" : "Novo fornecedor"}
      </h2>
      <Field
        name="name"
        label="Nome *"
        required
        defaultValue={supplier?.name}
      />
      <Field
        name="externalCode"
        label="Código externo"
        defaultValue={supplier?.externalCode ?? ""}
      />
      <Field
        name="country"
        label="País"
        defaultValue={supplier?.country ?? ""}
      />
      <button className="rounded-lg bg-brand px-4 py-2.5 font-semibold text-white">
        {supplier ? "Salvar alterações" : "Criar fornecedor"}
      </button>
    </form>
  );
}
function Field(
  props: React.InputHTMLAttributes<HTMLInputElement> & { label: string }
) {
  const { label, ...input } = props;
  return (
    <label className="text-sm font-medium">
      {label}
      <input {...input} className="mt-2 w-full rounded-lg border px-3 py-2" />
    </label>
  );
}
