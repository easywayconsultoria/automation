import Link from "next/link";
import { requireWorkspace } from "@/lib/auth/context";
import { prisma } from "@/lib/db/prisma";
export default async function DrawbackPage() {
  const { workspace } = await requireWorkspace();
  const rows = await prisma.drawbackRecord.findMany({
    where: { workspaceId: workspace.id },
    orderBy: { updatedAt: "desc" },
    include: { importProcess: true }
  });
  return (
    <>
      <h1 className="text-3xl font-semibold">Drawback</h1>
      <p className="mt-2 text-slate-600">
        Base inicial de regimes vinculados aos processos.
      </p>
      <div className="mt-8 space-y-3">
        {rows.map((row) => (
          <Link
            href={`/workspace/processes/${row.importProcessId}`}
            key={row.id}
            className="flex justify-between rounded-xl border bg-white p-5"
          >
            <div>
              <p className="font-semibold">{row.importProcess.reference}</p>
              <p className="mt-1 text-sm text-slate-600">
                {row.mode} · {row.referenceCode ?? "Sem referência"}
              </p>
            </div>
            <span className="text-xs font-bold">{row.status}</span>
          </Link>
        ))}
        {!rows.length && (
          <p className="rounded-xl border border-dashed bg-white p-8 text-slate-500">
            Nenhum drawback cadastrado.
          </p>
        )}
      </div>
    </>
  );
}
