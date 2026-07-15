import Link from "next/link";
import {
  confirmConversationDocumentType,
  parseConversationCsv,
  runConversationQuickAction,
  transitionSuggestedAction
} from "@/app/actions/conversation";
import { AttachmentComposer } from "@/components/attachment-composer";
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
            <p className="mt-5 text-sm font-semibold">Arquivos recebidos</p>
            <div className="mt-3 space-y-2">
              {conversation.attachments.map((attachment) => (
                <DocumentCard
                  key={attachment.id}
                  attachment={attachment}
                  processId={process.id}
                  compact
                >
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
                </DocumentCard>
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
                <p>
                  {
                    process.inconsistencies.filter((item) =>
                      item.type.startsWith("DOCUMENT_")
                    ).length
                  }{" "}
                  divergências documentais
                </p>
              </div>
            </details>
            {process.inconsistencies.length > 0 && (
              <details className="mt-4 border-t pt-3">
                <summary className="cursor-pointer text-sm font-semibold">
                  Achados da análise
                </summary>
                <div className="mt-3 space-y-2">
                  {process.inconsistencies.slice(0, 8).map((finding) => (
                    <div
                      key={finding.id}
                      className="rounded-lg bg-slate-50 p-2 text-xs"
                    >
                      <p className="font-semibold">{finding.title}</p>
                      <p className="mt-1 text-slate-500">
                        {finding.description}
                      </p>
                    </div>
                  ))}
                </div>
              </details>
            )}
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
                  <>
                    <OperationalAnalysisCard data={item.structuredData} />
                    <details className="mt-3 rounded-xl border bg-slate-50 p-3 text-xs">
                      <summary className="cursor-pointer font-semibold">
                        Ver evidências e dados
                      </summary>
                      <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap font-sans">
                        {JSON.stringify(item.structuredData, null, 2)}
                      </pre>
                    </details>
                  </>
                )}
              </div>
            </article>
          ))}
          {conversation.attachments.length > 0 && (
            <article className="rounded-2xl border bg-slate-50 p-4">
              <p className="text-xs font-bold text-brand">
                Arquivos no contexto
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {conversation.attachments.map((attachment) => (
                  <DocumentCard
                    key={attachment.id}
                    attachment={attachment}
                    processId={process.id}
                  />
                ))}
              </div>
            </article>
          )}
          {conversation.suggestedActions.length > 0 && (
            <article className="rounded-2xl border bg-white p-4">
              <p className="text-xs font-bold text-brand">
                Ações sugeridas para revisão humana
              </p>
              <div className="mt-3 space-y-3">
                {conversation.suggestedActions.map((action) => (
                  <SuggestedActionCard
                    key={action.id}
                    action={action}
                    processId={process.id}
                  />
                ))}
              </div>
            </article>
          )}
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
        <AttachmentComposer processId={process.id} />
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

type AnalysisFinding = {
  type?: unknown;
  severity?: unknown;
  title?: unknown;
  description?: unknown;
  source?: unknown;
};

function operationalAnalysis(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const root = value as Record<string, unknown>;
  const operational = root.operational;
  if (
    !operational ||
    typeof operational !== "object" ||
    Array.isArray(operational)
  )
    return null;
  const data = operational as Record<string, unknown>;
  return {
    documentsAnalyzed: Number(data.documentsAnalyzed ?? 0),
    documentItems: Number(data.documentItems ?? 0),
    matchedItems: Number(data.matchedItems ?? 0),
    unmatchedProcessItems: Number(data.unmatchedProcessItems ?? 0),
    findings: Array.isArray(data.findings)
      ? (data.findings as AnalysisFinding[])
      : []
  };
}

function OperationalAnalysisCard({ data }: { data: unknown }) {
  const analysis = operationalAnalysis(data);
  if (!analysis) return null;
  return (
    <div className="mt-4 rounded-2xl border bg-white p-4 text-left text-xs shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="font-bold text-slate-800">Cruzamento operacional</p>
        <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px]">
          {analysis.findings.length} achado(s)
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <AnalysisStat label="Documentos" value={analysis.documentsAnalyzed} />
        <AnalysisStat label="Linhas" value={analysis.documentItems} />
        <AnalysisStat label="Correspondências" value={analysis.matchedItems} />
        <AnalysisStat
          label="Sem suporte"
          value={analysis.unmatchedProcessItems}
        />
      </div>
      {analysis.findings.length > 0 && (
        <div className="mt-3 space-y-2">
          {analysis.findings.slice(0, 10).map((finding, index) => {
            const source =
              finding.source &&
              typeof finding.source === "object" &&
              !Array.isArray(finding.source)
                ? (finding.source as Record<string, unknown>)
                : {};
            return (
              <div
                key={`${String(finding.type)}-${index}`}
                className="rounded-xl border-l-4 border-amber-400 bg-amber-50 p-3"
              >
                <div className="flex justify-between gap-2">
                  <p className="font-semibold text-slate-800">
                    {String(finding.title ?? "Achado operacional")}
                  </p>
                  <span className="text-[9px] font-bold text-amber-700">
                    {String(finding.severity ?? "REVIEW")}
                  </span>
                </div>
                <p className="mt-1 text-slate-600">
                  {String(finding.description ?? "")}
                </p>
                <p className="mt-1 text-[10px] text-slate-400">
                  {[
                    source.documentName,
                    source.documentLine && `linha ${source.documentLine}`,
                    source.criterion
                  ]
                    .filter(Boolean)
                    .map(String)
                    .join(" · ")}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AnalysisStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-slate-50 p-2">
      <p className="text-[9px] uppercase text-slate-400">{label}</p>
      <p className="mt-1 text-base font-semibold">{value}</p>
    </div>
  );
}

type SuggestedActionCardProps = {
  id: string;
  title: string;
  description: string;
  status: string;
};

function SuggestedActionCard({
  action,
  processId
}: {
  action: SuggestedActionCardProps;
  processId: string;
}) {
  const targets =
    action.status === "OPEN"
      ? (["ACCEPTED", "DISMISSED"] as const)
      : action.status === "ACCEPTED"
        ? (["COMPLETED", "DISMISSED"] as const)
        : (["OPEN"] as const);
  const labels: Record<string, string> = {
    ACCEPTED: "Aceitar",
    DISMISSED: "Dispensar",
    COMPLETED: "Concluir",
    OPEN: "Reabrir"
  };
  return (
    <div className="rounded-xl border bg-slate-50 p-3 text-left text-xs">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{action.title}</p>
          <p className="mt-1 text-slate-500">{action.description}</p>
        </div>
        <span className="rounded-full bg-white px-2 py-1 text-[9px] font-bold text-slate-500">
          {action.status}
        </span>
      </div>
      <div className="mt-3 flex gap-2">
        {targets.map((target) => (
          <form action={transitionSuggestedAction} key={target}>
            <input type="hidden" name="processId" value={processId} />
            <input type="hidden" name="actionId" value={action.id} />
            <input type="hidden" name="toStatus" value={target} />
            <button className="rounded-full border bg-white px-3 py-1 text-[10px] font-semibold hover:border-slate-400">
              {labels[target]}
            </button>
          </form>
        ))}
      </div>
    </div>
  );
}

type DocumentCardAttachment = {
  id: string;
  label: string | null;
  kind: string;
  processDocument: {
    fileName: string;
    type: string;
    detectedType: string | null;
    confirmedType: string | null;
    status: string;
    processingSummary: unknown;
    processingErrors: unknown;
  } | null;
};

function humanType(value: string | null | undefined) {
  if (!value) return "não identificado";
  return value.replaceAll("_", " ").toLowerCase();
}

function errorMessages(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) =>
      item && typeof item === "object" && "message" in item
        ? String(item.message)
        : ""
    )
    .filter(Boolean)
    .slice(0, 5);
}

function summaryFacts(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const data = value as Record<string, unknown>;
  return [
    data.root ? `Raiz XML: ${String(data.root)}` : null,
    data.itemCount !== undefined ? `Itens: ${String(data.itemCount)}` : null,
    data.sheetCount !== undefined
      ? `Planilhas: ${String(data.sheetCount)}`
      : null,
    data.activeSheet ? `Planilha ativa: ${String(data.activeSheet)}` : null,
    data.identifier ? `Identificador: ${String(data.identifier)}` : null
  ].filter((item): item is string => Boolean(item));
}

function DocumentCard({
  attachment,
  processId,
  compact = false,
  children
}: {
  attachment: DocumentCardAttachment;
  processId: string;
  compact?: boolean;
  children?: React.ReactNode;
}) {
  const document = attachment.processDocument;
  const errors = errorMessages(document?.processingErrors);
  const facts = summaryFacts(document?.processingSummary);
  const pending = document?.status === "PENDING_CLASSIFICATION";
  return (
    <div className="rounded-xl border bg-white p-3 text-left text-xs">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold">
            {attachment.label ?? document?.fileName}
          </p>
          <p className="mt-1 text-[10px] text-slate-400">
            Detectado: {humanType(document?.detectedType ?? document?.type)}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-semibold ${
            document?.status === "FAILED"
              ? "bg-red-50 text-red-700"
              : pending
                ? "bg-amber-50 text-amber-700"
                : "bg-emerald-50 text-emerald-700"
          }`}
        >
          {document?.status.replaceAll("_", " ") ?? "UPLOADED"}
        </span>
      </div>
      {document?.confirmedType && (
        <p className="mt-2 font-medium text-emerald-700">
          Confirmado: {humanType(document.confirmedType)}
        </p>
      )}
      {pending && (
        <p className="mt-2 text-amber-700">
          Estrutura válida, mas a classificação precisa ser confirmada.
        </p>
      )}
      {!compact && facts.length > 0 && (
        <div className="mt-2 space-y-1 text-slate-500">
          {facts.map((fact) => (
            <p key={fact}>{fact}</p>
          ))}
        </div>
      )}
      {!compact && errors.length > 0 && (
        <details className="mt-2 rounded-lg bg-amber-50 p-2 text-amber-800">
          <summary className="cursor-pointer font-semibold">
            {errors.length} alerta(s) de processamento
          </summary>
          <ul className="mt-1 list-disc space-y-1 pl-4">
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </details>
      )}
      <form
        action={confirmConversationDocumentType}
        className="mt-3 flex items-center gap-2"
      >
        <input type="hidden" name="processId" value={processId} />
        <input type="hidden" name="attachmentId" value={attachment.id} />
        <select
          name="classification"
          defaultValue={
            attachment.kind === "PORTAL_UNICO_CSV" ||
            attachment.kind === "DRAWBACK_CSV"
              ? attachment.kind
              : (document?.confirmedType ??
                document?.detectedType ??
                "SUPPORT_DOC")
          }
          aria-label={`Tipo documental de ${attachment.label}`}
          className="min-w-0 flex-1 rounded-lg border bg-white px-2 py-1.5 text-[10px]"
        >
          <option value="INVOICE">Invoice</option>
          <option value="PORTAL_UNICO_CSV">Portal Único CSV</option>
          <option value="DRAWBACK_CSV">Drawback CSV</option>
          <option value="XLSX_OPERATIONAL">XLSX operacional</option>
          <option value="XML_OPERATIONAL">XML operacional</option>
          <option value="SUPPORT_DOC">Suporte / anexo geral</option>
        </select>
        <button className="rounded-lg bg-slate-900 px-2 py-1.5 text-[10px] font-semibold text-white">
          {document?.confirmedType ? "Corrigir" : "Confirmar"}
        </button>
      </form>
      {children}
    </div>
  );
}
