import Link from "next/link";
import {
  parseConversationCsv,
  runConversationQuickAction,
  sendConversationMessage,
  uploadConversationAttachment
} from "@/app/actions/conversation";
import { requireProcess } from "@/lib/auth/context";
import { prisma } from "@/lib/db/prisma";

const quickActions = [
  ["summarize_process", "Resumir"],
  ["run_analysis", "Analisar operação"],
  ["list_inconsistencies", "Ver lacunas"],
  ["generate_action_plan", "Gerar plano"],
  ["summarize_drawback", "Revisar drawback"]
] as const;

export default async function ProcessChatPage({
  params,
  searchParams
}: {
  params: Promise<{ processId: string }>;
  searchParams: Promise<{ message?: string }>;
}) {
  const { processId } = await params;
  const { workspace } = await requireProcess(processId);
  const [process, conversation, proposals] = await Promise.all([
    prisma.importProcess.findFirst({
      where: { id: processId, workspaceId: workspace.id },
      include: {
        documents: { orderBy: { uploadedAt: "desc" }, take: 12 },
        items: { select: { id: true } },
        inconsistencies: {
          where: { status: "OPEN" },
          orderBy: { createdAt: "desc" }
        },
        actionPlan: true,
        drawback: true
      }
    }),
    prisma.conversation.findFirst({
      where: { workspaceId: workspace.id, importProcessId: processId },
      include: {
        messages: { orderBy: { createdAt: "asc" }, take: 150 },
        attachments: {
          orderBy: { createdAt: "desc" },
          take: 20,
          include: {
            processDocument: {
              include: { portalCsvImports: true, drawbackCsvImports: true }
            }
          }
        },
        suggestedActions: { orderBy: { createdAt: "desc" }, take: 12 }
      }
    }),
    prisma.registrationProposal.findMany({
      where: {
        workspaceId: workspace.id,
        importProcessId: processId,
        status: { in: ["DRAFT", "PENDING_REVIEW", "ACCEPTED"] }
      },
      orderBy: { updatedAt: "desc" }
    })
  ]);
  if (!process || !conversation) return null;
  const { message } = await searchParams;
  return (
    <div className="flex h-dvh min-h-0 flex-col bg-white">
      <header className="flex h-14 shrink-0 items-center justify-between border-b px-5">
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold">
            {conversation.title ?? process.clientName}
          </h1>
          <p className="text-[10px] text-slate-400">
            {process.reference} · {process.status.replaceAll("_", " ")}
          </p>
        </div>
        <details className="relative z-40">
          <summary className="cursor-pointer list-none rounded-full border px-3 py-1.5 text-xs text-slate-500">
            Contexto
          </summary>
          <div className="absolute right-0 top-10 max-h-[82dvh] w-[340px] overflow-y-auto rounded-2xl border bg-white p-4 shadow-2xl">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Estado da operação
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <Stat label="Documentos" value={process.documents.length} />
              <Stat label="Itens" value={process.items.length} />
              <Stat label="Lacunas" value={process.inconsistencies.length} />
              <Stat label="Propostas" value={proposals.length} />
            </div>
            <form
              action={uploadConversationAttachment}
              className="mt-5 rounded-xl bg-slate-50 p-3"
            >
              <input type="hidden" name="processId" value={process.id} />
              <p className="text-sm font-semibold">Anexar à conversa</p>
              <select
                name="kind"
                className="mt-3 w-full rounded-lg border bg-white px-3 py-2 text-xs"
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
                className="mt-3 block w-full text-xs"
              />
              <button className="mt-3 w-full rounded-lg bg-ink px-3 py-2 text-xs font-semibold text-white">
                Adicionar arquivo
              </button>
            </form>
            <div className="mt-4 space-y-2">
              {conversation.attachments.map((attachment) => (
                <div key={attachment.id} className="rounded-xl border p-3">
                  <p className="truncate text-xs font-semibold">
                    {attachment.label}
                  </p>
                  <p className="text-[10px] text-slate-400">
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
                      <button className="text-xs font-semibold text-brand">
                        Processar no contexto
                      </button>
                    </form>
                  )}
                </div>
              ))}
            </div>
            <details className="mt-4 border-t pt-3">
              <summary className="cursor-pointer text-sm font-semibold">
                Decisões e ferramentas
              </summary>
              <div className="mt-3 space-y-2 text-xs text-slate-600">
                <p>Plano: {process.actionPlan?.status ?? "não gerado"}</p>
                <p>Drawback: {process.drawback?.status ?? "não informado"}</p>
                <p>{conversation.suggestedActions.length} ações sugeridas</p>
                <p>{proposals.length} propostas em revisão</p>
              </div>
            </details>
            <Link
              href={`/workspace/processes/${process.id}`}
              className="mt-5 block text-center text-xs text-slate-400 hover:text-slate-700"
            >
              Abrir registro técnico completo
            </Link>
          </div>
        </details>
      </header>
      {message && (
        <p className="mx-auto mt-3 rounded-full bg-emerald-50 px-4 py-2 text-xs text-emerald-800">
          {message}
        </p>
      )}
      <div className="flex-1 overflow-y-auto px-5 py-8">
        <div className="mx-auto max-w-3xl space-y-7">
          {conversation.messages.map((item) => (
            <article
              key={item.id}
              className={
                item.role === "USER"
                  ? "flex justify-end"
                  : item.role === "TOOL" || item.role === "SYSTEM"
                    ? "text-center text-xs text-slate-400"
                    : "text-sm leading-7 text-slate-700"
              }
            >
              <div
                className={
                  item.role === "USER"
                    ? "max-w-[82%] rounded-3xl bg-slate-100 px-5 py-3 text-sm"
                    : "w-full"
                }
              >
                {item.role === "ASSISTANT" && (
                  <p className="mb-1 text-xs font-bold text-brand">
                    EasyWay IA
                  </p>
                )}
                <p className="whitespace-pre-wrap">{item.content}</p>
                {item.role === "ASSISTANT" && item.structuredData && (
                  <details className="mt-3 rounded-xl border bg-slate-50 p-3 text-xs">
                    <summary className="cursor-pointer font-semibold">
                      Ver evidências e dados
                    </summary>
                    <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap font-sans">
                      {JSON.stringify(item.structuredData, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>
      <footer className="shrink-0 bg-gradient-to-t from-white via-white to-transparent px-5 pb-5 pt-5">
        <div className="mx-auto mb-2 flex max-w-3xl gap-2 overflow-x-auto">
          {quickActions.map(([toolName, label]) => (
            <form action={runConversationQuickAction} key={toolName}>
              <input type="hidden" name="processId" value={process.id} />
              <input type="hidden" name="toolName" value={toolName} />
              <button className="whitespace-nowrap rounded-full border px-3 py-1.5 text-xs text-slate-600 hover:border-slate-400">
                {label}
              </button>
            </form>
          ))}
        </div>
        <form
          action={sendConversationMessage}
          className="mx-auto flex max-w-3xl items-end gap-3 rounded-[26px] border bg-white p-3 shadow-[0_10px_35px_rgba(15,23,42,0.12)]"
        >
          <input type="hidden" name="processId" value={process.id} />
          <textarea
            name="content"
            required
            rows={2}
            placeholder="Pergunte, anexe contexto ou peça uma ação…"
            className="min-h-14 flex-1 resize-none border-0 px-3 py-2 text-sm outline-none"
          />
          <button className="grid size-10 shrink-0 place-items-center rounded-full bg-ink text-white">
            ↑
          </button>
        </form>
        <p className="mt-2 text-center text-[10px] text-slate-400">
          Ferramentas determinísticas · decisões auditáveis · revisão humana
        </p>
      </footer>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <p className="text-slate-400">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-800">{value}</p>
    </div>
  );
}
