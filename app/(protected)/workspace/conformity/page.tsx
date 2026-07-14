import Link from "next/link";
import { requireWorkspace } from "@/lib/auth/context";
import { prisma } from "@/lib/db/prisma";
export default async function ConformityPage() {
  const { workspace } = await requireWorkspace();
  const rows = await prisma.inconsistency.findMany({
    where: { workspaceId: workspace.id, status: "OPEN" },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { importProcess: true }
  });
  return (
    <>
      <h1 className="text-3xl font-semibold">Conformidade</h1>
      <p className="mt-2 text-slate-600">
        Inconsistências abertas no workspace.
      </p>
      <div className="mt-8 space-y-3">
        {rows.map((row) => (
          <Link
            href={`/workspace/processes/${row.importProcessId}`}
            key={row.id}
            className="block rounded-xl border bg-white p-5"
          >
            <div className="flex justify-between gap-4">
              <p className="font-semibold">{row.title}</p>
              <span className="text-xs font-bold text-amber-700">
                {row.severity}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-600">
              {row.importProcess.reference} · {row.description}
            </p>
          </Link>
        ))}
        {!rows.length && (
          <p className="rounded-xl border border-dashed bg-white p-8 text-slate-500">
            Nenhuma inconsistência aberta.
          </p>
        )}
      </div>
    </>
  );
}
