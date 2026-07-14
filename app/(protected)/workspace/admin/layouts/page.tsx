import {
  createCsvLayout,
  testCsvLayoutSandbox,
  transitionCsvLayout,
  updateCsvLayout
} from "@/app/actions/layout-admin";
import { requireLayoutAdmin } from "@/lib/auth/context";
import { prisma } from "@/lib/db/prisma";

const badge: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  TESTING: "bg-blue-100 text-blue-800",
  ACTIVE: "bg-emerald-100 text-emerald-800",
  INACTIVE: "bg-amber-100 text-amber-800",
  DEPRECATED: "bg-red-100 text-red-800"
};
export default async function LayoutAdminPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string; message?: string }>;
}) {
  const { workspace } = await requireLayoutAdmin();
  const { q = "", message } = await searchParams;
  const normalizedQuery = q.trim().toUpperCase();
  const typeQuery: "PORTAL_UNICO" | "DRAWBACK" | null =
    normalizedQuery.includes("PORTAL")
      ? "PORTAL_UNICO"
      : normalizedQuery.includes("DRAWBACK")
        ? "DRAWBACK"
        : null;
  const layouts = await prisma.csvLayoutDefinition.findMany({
    where: {
      AND: [
        { OR: [{ workspaceId: workspace.id }, { workspaceId: null }] },
        ...(q
          ? [
              {
                OR: [
                  { name: { contains: q, mode: "insensitive" as const } },
                  { version: { contains: q, mode: "insensitive" as const } },
                  ...(typeQuery ? [{ type: typeQuery }] : [])
                ]
              }
            ]
          : [])
      ]
    },
    include: {
      statusEvents: { orderBy: { createdAt: "desc" }, take: 10 },
      sandboxTests: { orderBy: { createdAt: "desc" }, take: 5 }
    },
    orderBy: [{ type: "asc" }, { version: "desc" }]
  });
  return (
    <>
      <p className="text-sm font-semibold text-brand">
        Administração controlada
      </p>
      <h1 className="mt-1 text-3xl font-semibold">Contratos de layout CSV</h1>
      <p className="mt-2 text-slate-600">
        Rascunho, sandbox, ativação e histórico sem contaminar processos reais.
      </p>
      {message && (
        <p className="mt-5 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </p>
      )}
      <div className="mt-8 grid gap-5 xl:grid-cols-[380px_1fr]">
        <LayoutForm />
        <div>
          <form className="flex gap-2">
            <input
              name="q"
              defaultValue={q}
              placeholder="Buscar nome ou versão"
              className="w-full rounded-lg border bg-white px-4 py-2.5 text-sm"
            />
            <button className="rounded-lg border bg-white px-4 py-2 text-sm font-semibold">
              Buscar
            </button>
          </form>
          <div className="mt-3 space-y-4">
            {layouts.map((layout) => (
              <details
                key={layout.id}
                className="rounded-xl border bg-white p-5"
              >
                <summary className="cursor-pointer list-none">
                  <div className="flex justify-between gap-3">
                    <div>
                      <p className="font-semibold">
                        {layout.name} · v{layout.version}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {layout.type} ·{" "}
                        {layout.workspaceId
                          ? "Workspace"
                          : "Global somente leitura"}
                      </p>
                    </div>
                    <span
                      className={`h-fit rounded-full px-3 py-1 text-xs font-bold ${badge[layout.status]}`}
                    >
                      {layout.status}
                    </span>
                  </div>
                </summary>
                <div className="mt-5 grid gap-5 border-t pt-5 lg:grid-cols-2">
                  <div className="space-y-4">
                    {layout.workspaceId && layout.status === "DRAFT" ? (
                      <LayoutForm layout={layout} />
                    ) : (
                      <ContractView layout={layout} />
                    )}
                    <StatusActions layout={layout} />
                  </div>
                  <div>
                    <Sandbox layout={layout} />
                    <History layout={layout} />
                  </div>
                </div>
              </details>
            ))}
            {!layouts.length && (
              <p className="rounded-xl border border-dashed bg-white p-8 text-sm text-slate-500">
                Nenhum contrato encontrado.
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
type LayoutValue = {
  id: string;
  workspaceId: string | null;
  name: string;
  type: "PORTAL_UNICO" | "DRAWBACK";
  version: string;
  status: string;
  requiredColumns: unknown;
  optionalColumns: unknown;
  expectedOrder: unknown;
  validationRules: unknown;
  aliases: unknown;
  description: string;
  sandboxTests?: TestValue[];
  statusEvents?: EventValue[];
};
type TestValue = {
  id: string;
  fileName: string;
  passed: boolean;
  validRows: number;
  invalidRows: number;
  errors: unknown;
  preview: unknown;
  createdAt: Date;
};
type EventValue = {
  id: string;
  fromStatus: string;
  toStatus: string;
  reason: string | null;
  createdAt: Date;
};
const csv = (value: unknown) => (Array.isArray(value) ? value.join(", ") : "");
function LayoutForm({ layout }: { layout?: LayoutValue }) {
  return (
    <form
      action={layout ? updateCsvLayout : createCsvLayout}
      className="grid gap-3 rounded-xl border bg-white p-5"
    >
      {layout && <input type="hidden" name="layoutId" value={layout.id} />}
      <h2 className="font-semibold">
        {layout ? "Editar rascunho" : "Novo contrato"}
      </h2>
      <Field name="name" label="Nome *" required defaultValue={layout?.name} />
      <label className="text-sm font-medium">
        Tipo
        <select
          name="type"
          defaultValue={layout?.type ?? "PORTAL_UNICO"}
          className="mt-2 w-full rounded-lg border px-3 py-2"
        >
          <option value="PORTAL_UNICO">Portal Único</option>
          <option value="DRAWBACK">Drawback</option>
        </select>
      </label>
      <Field
        name="version"
        label="Versão *"
        required
        placeholder="1.1"
        defaultValue={layout?.version}
      />
      <Field
        name="requiredColumns"
        label="Colunas obrigatórias *"
        required
        defaultValue={csv(layout?.requiredColumns)}
      />
      <Field
        name="optionalColumns"
        label="Colunas opcionais"
        defaultValue={csv(layout?.optionalColumns)}
      />
      <Field
        name="expectedOrder"
        label="Ordem exata *"
        required
        defaultValue={csv(layout?.expectedOrder)}
      />
      <label className="text-sm font-medium">
        Aliases JSON
        <textarea
          name="aliases"
          rows={3}
          defaultValue={JSON.stringify(layout?.aliases ?? {}, null, 2)}
          className="mt-2 w-full rounded-lg border px-3 py-2 font-mono text-xs"
        />
      </label>
      <label className="text-sm font-medium">
        Regras JSON
        <textarea
          name="validationRules"
          rows={3}
          defaultValue={JSON.stringify(
            layout?.validationRules ?? { delimiter: ",", encoding: "UTF-8" },
            null,
            2
          )}
          className="mt-2 w-full rounded-lg border px-3 py-2 font-mono text-xs"
        />
      </label>
      <Field
        name="description"
        label="Descrição *"
        required
        defaultValue={layout?.description}
      />
      <button className="rounded-lg bg-brand px-4 py-2.5 font-semibold text-white">
        {layout ? "Salvar rascunho" : "Criar rascunho"}
      </button>
    </form>
  );
}
function ContractView({ layout }: { layout: LayoutValue }) {
  return (
    <div className="rounded-lg bg-slate-50 p-4 text-xs">
      <p>{layout.description}</p>
      <p className="mt-3 font-semibold">Assinatura</p>
      <code className="mt-1 block break-all">{csv(layout.expectedOrder)}</code>
      <p className="mt-3 font-semibold">Aliases</p>
      <pre className="mt-1 whitespace-pre-wrap">
        {JSON.stringify(layout.aliases, null, 2)}
      </pre>
    </div>
  );
}
function StatusActions({ layout }: { layout: LayoutValue }) {
  if (!layout.workspaceId)
    return (
      <p className="text-xs text-slate-500">
        Contratos globais são protegidos contra edição pelo workspace.
      </p>
    );
  const next: Record<string, string[]> = {
    DRAFT: ["TESTING", "INACTIVE"],
    TESTING: ["DRAFT", "ACTIVE", "INACTIVE"],
    ACTIVE: ["INACTIVE", "DEPRECATED"],
    INACTIVE: ["DRAFT", "ACTIVE"],
    DEPRECATED: []
  };
  return (
    <div className="flex flex-wrap gap-2">
      {(next[layout.status] ?? []).map((status) => (
        <form action={transitionCsvLayout} key={status}>
          <input type="hidden" name="layoutId" value={layout.id} />
          <input type="hidden" name="target" value={status} />
          <button className="rounded border px-3 py-1.5 text-xs font-semibold">
            Mover para {status}
          </button>
        </form>
      ))}
    </div>
  );
}
function Sandbox({ layout }: { layout: LayoutValue }) {
  return (
    <div className="rounded-xl border p-4">
      <h3 className="font-semibold">Sandbox anônimo</h3>
      <form action={testCsvLayoutSandbox} className="mt-3 space-y-3">
        <input type="hidden" name="layoutId" value={layout.id} />
        <input
          type="file"
          name="file"
          accept=".csv,text/csv"
          required
          className="block w-full text-xs"
        />
        <button className="rounded-lg bg-ink px-3 py-2 text-xs font-semibold text-white">
          Executar teste isolado
        </button>
      </form>
      {layout.sandboxTests?.map((test) => (
        <details key={test.id} className="mt-3 rounded bg-slate-50 p-2 text-xs">
          <summary className="cursor-pointer font-semibold">
            {test.passed ? "✓" : "✕"} {test.fileName} · {test.validRows} válidas
          </summary>
          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap">
            {JSON.stringify(
              { errors: test.errors, preview: test.preview },
              null,
              2
            )}
          </pre>
        </details>
      ))}
    </div>
  );
}
function History({ layout }: { layout: LayoutValue }) {
  return (
    <div className="mt-4 rounded-xl border p-4">
      <h3 className="font-semibold">Histórico de status</h3>
      {layout.statusEvents?.map((event) => (
        <p key={event.id} className="mt-2 text-xs text-slate-600">
          {event.fromStatus} → {event.toStatus} ·{" "}
          {event.createdAt.toLocaleString("pt-BR")}
        </p>
      ))}
      {!layout.statusEvents?.length && (
        <p className="mt-2 text-xs text-slate-500">
          Sem transições registradas.
        </p>
      )}
    </div>
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
