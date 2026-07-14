import Link from "next/link";
import { requireWorkspace } from "@/lib/auth/context";
import { prisma } from "@/lib/db/prisma";
import { matchInvoiceItem } from "@/lib/domain/analysis";

function rate(matched: number, total: number) {
  return total ? Math.round((matched / total) * 1000) / 10 : 0;
}

export default async function WorkspacePage() {
  const { workspace } = await requireWorkspace();
  const [
    processes,
    products,
    pending,
    inconsistencies,
    drawbacks,
    aliasGroups
  ] = await Promise.all([
    prisma.importProcess.findMany({
      where: { workspaceId: workspace.id },
      include: { items: true, supplier: true },
      orderBy: { createdAt: "desc" }
    }),
    prisma.productCatalog.findMany({
      where: { workspaceId: workspace.id, active: true },
      include: { aliases: true }
    }),
    prisma.importProcess.count({
      where: { workspaceId: workspace.id, status: "PENDING_ACTION" }
    }),
    prisma.inconsistency.count({
      where: { workspaceId: workspace.id, status: "OPEN" }
    }),
    prisma.drawbackRecord.count({ where: { workspaceId: workspace.id } }),
    prisma.productAlias.groupBy({
      by: ["supplierId"],
      where: { workspaceId: workspace.id },
      _count: true
    })
  ]);

  const processMetrics = processes.map((process) => {
    const matched = process.items.filter((item) =>
      matchInvoiceItem(item, products, process.supplierId)
    ).length;
    return {
      id: process.id,
      reference: process.reference,
      supplier: process.supplier?.name ?? "Sem fornecedor",
      total: process.items.length,
      matched,
      rate: rate(matched, process.items.length)
    };
  });
  const totalItems = processMetrics.reduce((sum, item) => sum + item.total, 0);
  const matchedItems = processMetrics.reduce(
    (sum, item) => sum + item.matched,
    0
  );
  const supplierMetrics = new Map<string, { total: number; matched: number }>();
  for (const metric of processMetrics) {
    const current = supplierMetrics.get(metric.supplier) ?? {
      total: 0,
      matched: 0
    };
    current.total += metric.total;
    current.matched += metric.matched;
    supplierMetrics.set(metric.supplier, current);
  }
  const globalAliases =
    aliasGroups.find((group) => !group.supplierId)?._count ?? 0;
  const supplierAliases = aliasGroups.reduce(
    (sum, group) => sum + (group.supplierId ? group._count : 0),
    0
  );
  const cards = [
    ["Processos", processes.length, "Operações cadastradas"],
    ["Aguardando ação", pending, "Processos com pendências"],
    ["Inconsistências abertas", inconsistencies, "Pontos para conferência"],
    ["Drawbacks", drawbacks, "Registros acompanhados"]
  ] as const;
  const quality = [
    ["Itens", totalItems, "Base total analisável"],
    ["Classificados", matchedItems, "Match válido neste momento"],
    [
      "Sem correspondência",
      totalItems - matchedItems,
      "Exigem catálogo ou alias"
    ],
    [
      "Taxa de correspondência",
      `${rate(matchedItems, totalItems)}%`,
      "Qualidade operacional"
    ],
    ["Aliases globais", globalAliases, "Aplicáveis sem fornecedor"],
    ["Aliases específicos", supplierAliases, "Com contexto de fornecedor"]
  ] as const;
  return (
    <>
      <div className="mb-8">
        <p className="text-sm font-semibold text-brand">Dashboard</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          Visão operacional
        </h1>
        <p className="mt-2 text-slate-600">
          Acompanhe processos, conformidade e qualidade do matching.
        </p>
      </div>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([title, value, description]) => (
          <MetricCard
            key={title}
            title={title}
            value={value}
            description={description}
          />
        ))}
      </section>

      <section className="mt-12">
        <h2 className="text-2xl font-semibold">Qualidade da classificação</h2>
        <p className="mt-1 text-sm text-slate-500">
          Calculada pelo mesmo matching determinístico usado na análise.
        </p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {quality.map(([title, value, description]) => (
            <MetricCard
              key={title}
              title={title}
              value={value}
              description={description}
            />
          ))}
        </div>
        <div className="mt-6 grid gap-5 xl:grid-cols-2">
          <QualityTable
            title="Por processo"
            rows={processMetrics.map((item) => [
              item.reference,
              `${item.matched}/${item.total}`,
              `${item.rate}%`
            ])}
          />
          <QualityTable
            title="Por fornecedor"
            rows={[...supplierMetrics].map(([name, item]) => [
              name,
              `${item.matched}/${item.total}`,
              `${rate(item.matched, item.total)}%`
            ])}
          />
        </div>
      </section>
      <div className="mt-8 flex gap-3">
        <Link
          href="/workspace/processes"
          className="inline-flex rounded-lg bg-brand px-5 py-3 font-semibold text-white"
        >
          Gerenciar processos
        </Link>
        <Link
          href="/workspace/suppliers"
          className="inline-flex rounded-lg border bg-white px-5 py-3 font-semibold"
        >
          Gerenciar fornecedores
        </Link>
      </div>
    </>
  );
}

function MetricCard({
  title,
  value,
  description
}: {
  title: string;
  value: string | number;
  description: string;
}) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{title}</p>
      <p className="mt-3 text-3xl font-semibold">{value}</p>
      <p className="mt-2 text-sm text-slate-600">{description}</p>
    </article>
  );
}
function QualityTable({ title, rows }: { title: string; rows: string[][] }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-white">
      <h3 className="border-b px-5 py-4 font-semibold">{title}</h3>
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-slate-500">
          <tr>
            <th className="px-5 py-3">Contexto</th>
            <th className="px-5 py-3">Match</th>
            <th className="px-5 py-3">Taxa</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row[0]} className="border-t">
              <td className="px-5 py-3">{row[0]}</td>
              <td className="px-5 py-3">{row[1]}</td>
              <td className="px-5 py-3 font-semibold">{row[2]}</td>
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={3} className="px-5 py-6 text-slate-500">
                Sem dados.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
