import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { requireWorkspace } from "@/lib/auth/context";

export default async function WorkspacePage() {
  const { workspace } = await requireWorkspace();
  const [processes, pending, inconsistencies, drawbacks] = await Promise.all([
    prisma.importProcess.count({ where: { workspaceId: workspace.id } }),
    prisma.importProcess.count({
      where: { workspaceId: workspace.id, status: "PENDING_ACTION" }
    }),
    prisma.inconsistency.count({
      where: { workspaceId: workspace.id, status: "OPEN" }
    }),
    prisma.drawbackRecord.count({ where: { workspaceId: workspace.id } })
  ]);
  const cards = [
    ["Processos", processes, "Operações cadastradas"],
    ["Aguardando ação", pending, "Processos com pendências"],
    ["Inconsistências abertas", inconsistencies, "Pontos para conferência"],
    ["Drawbacks", drawbacks, "Registros acompanhados"]
  ] as const;
  return (
    <>
      <div className="mb-8">
        <p className="text-sm font-semibold text-brand">Dashboard</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          Visão operacional
        </h1>
        <p className="mt-2 text-slate-600">
          Acompanhe processos, conformidade e ações do workspace.
        </p>
      </div>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([title, value, description]) => (
          <article
            key={title}
            className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <p className="text-sm font-medium text-slate-500">{title}</p>
            <p className="mt-3 text-3xl font-semibold">{value}</p>
            <p className="mt-2 text-sm text-slate-600">{description}</p>
          </article>
        ))}
      </section>
      <Link
        href="/workspace/processes"
        className="mt-8 inline-flex rounded-lg bg-brand px-5 py-3 font-semibold text-white"
      >
        Gerenciar processos
      </Link>
    </>
  );
}
