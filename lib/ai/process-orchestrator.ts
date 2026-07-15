import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  actionForFinding,
  analyzeProcess,
  matchInvoiceItem
} from "@/lib/domain/analysis";

export const processTools = [
  "summarize_process",
  "list_inconsistencies",
  "run_analysis",
  "generate_action_plan",
  "list_documents",
  "list_unmatched_items",
  "list_ncm_issues",
  "summarize_drawback",
  "suggest_next_steps",
  "summarize_portal_data",
  "summarize_drawback_balances",
  "compare_process_items_with_portal_data",
  "identify_portal_registration_gaps",
  "suggest_product_registration_actions",
  "summarize_drawback_coverage"
] as const;
export type ProcessTool = (typeof processTools)[number];

export function inferProcessTool(message: string): ProcessTool {
  const text = message.toLocaleLowerCase("pt-BR");
  if (/rod(ar|e)|reanalis|analis(ar|e).*(processo|agora)/.test(text))
    return "run_analysis";
  if (/ger(ar|e).*(plano)|plano de a[cç][aã]o/.test(text))
    return "generate_action_plan";
  if (/sem (classifica|correspond)|n[aã]o classific/.test(text))
    return "list_unmatched_items";
  if (/ncm/.test(text)) return "list_ncm_issues";
  if (/drawback|saldo/.test(text)) return "summarize_drawback";
  if (/portal.*(resum|dados)/.test(text)) return "summarize_portal_data";
  if (/portal.*(lacuna|cadastro|registr)/.test(text))
    return "identify_portal_registration_gaps";
  if (/document|anexo|arquivo/.test(text)) return "list_documents";
  if (/inconsist|pend[eê]ncia|problema/.test(text))
    return "list_inconsistencies";
  if (/pr[oó]xim|o que fazer|sugest/.test(text)) return "suggest_next_steps";
  return "summarize_process";
}

type ToolResult = {
  content: string;
  data: Record<string, unknown>;
  suggestions?: { type: string; title: string; description: string }[];
};

export async function runConversationTurn(input: {
  processId: string;
  workspaceId: string;
  userId: string;
  message?: string;
  requestedTool?: ProcessTool;
}) {
  const conversation = await prisma.conversation.findFirst({
    where: { importProcessId: input.processId, workspaceId: input.workspaceId }
  });
  if (!conversation) throw new Error("CONVERSATION_NOT_FOUND");
  if (input.message?.trim())
    await prisma.conversationMessage.create({
      data: {
        conversationId: conversation.id,
        workspaceId: input.workspaceId,
        role: "USER",
        content: input.message.trim(),
        createdById: input.userId
      }
    });
  const toolName = input.requestedTool ?? inferProcessTool(input.message ?? "");
  const execution = await prisma.toolExecution.create({
    data: {
      conversationId: conversation.id,
      workspaceId: input.workspaceId,
      importProcessId: input.processId,
      toolName,
      input: { message: input.message ?? null } as Prisma.InputJsonValue
    }
  });
  try {
    const result = await executeTool(
      toolName,
      input.processId,
      input.workspaceId
    );
    const explanation = explain(toolName, result.data);
    const assistant = await prisma.$transaction(async (tx) => {
      await tx.toolExecution.update({
        where: { id: execution.id },
        data: {
          status: "COMPLETED",
          output: result.data as Prisma.InputJsonValue,
          criteria: explanation.criteria as Prisma.InputJsonValue,
          sources: explanation.sources as Prisma.InputJsonValue,
          limitations: explanation.limitations as Prisma.InputJsonValue,
          completedAt: new Date()
        }
      });
      await tx.conversationMessage.create({
        data: {
          conversationId: conversation.id,
          workspaceId: input.workspaceId,
          role: "TOOL",
          content: `Ferramenta executada: ${toolName}`,
          structuredData: {
            toolExecutionId: execution.id,
            toolName
          } as Prisma.InputJsonValue
        }
      });
      const message = await tx.conversationMessage.create({
        data: {
          conversationId: conversation.id,
          workspaceId: input.workspaceId,
          role: "ASSISTANT",
          content: result.content,
          structuredData: {
            ...result.data,
            explanation
          } as Prisma.InputJsonValue
        }
      });
      if (result.suggestions?.length) {
        await tx.suggestedAction.deleteMany({
          where: {
            conversationId: conversation.id,
            workspaceId: input.workspaceId,
            status: "OPEN",
            type: {
              in: result.suggestions.map((suggestion) => suggestion.type)
            }
          }
        });
        await tx.suggestedAction.createMany({
          data: result.suggestions.map((suggestion) => ({
            ...suggestion,
            conversationId: conversation.id,
            workspaceId: input.workspaceId,
            importProcessId: input.processId,
            sourceMessageId: message.id
          }))
        });
      }
      await tx.conversation.update({
        where: { id: conversation.id },
        data: { updatedAt: new Date() }
      });
      return message;
    });
    return { toolName, assistant };
  } catch (error) {
    await prisma.toolExecution.update({
      where: { id: execution.id },
      data: {
        status: "FAILED",
        output: { error: error instanceof Error ? error.message : "UNKNOWN" },
        completedAt: new Date()
      }
    });
    throw error;
  }
}

async function loadContext(processId: string, workspaceId: string) {
  const [process, products] = await Promise.all([
    prisma.importProcess.findFirst({
      where: { id: processId, workspaceId },
      include: {
        supplier: true,
        documents: { orderBy: { uploadedAt: "desc" } },
        items: { orderBy: { lineNumber: "asc" } },
        inconsistencies: {
          where: { status: "OPEN" },
          orderBy: { createdAt: "desc" }
        },
        actionPlan: { include: { items: true } },
        drawback: true,
        portalCsvImports: {
          include: { rows: true },
          orderBy: { processedAt: "desc" }
        },
        drawbackCsvImports: {
          include: { rows: true },
          orderBy: { processedAt: "desc" }
        }
      }
    }),
    prisma.productCatalog.findMany({
      where: { workspaceId, active: true },
      include: { aliases: true }
    })
  ]);
  if (!process) throw new Error("PROCESS_NOT_FOUND");
  return { process, products };
}

async function executeTool(
  tool: ProcessTool,
  processId: string,
  workspaceId: string
): Promise<ToolResult> {
  const { process, products } = await loadContext(processId, workspaceId);
  const unmatched = process.items.filter(
    (item) => !matchInvoiceItem(item, products, process.supplierId)
  );
  const portalRows = process.portalCsvImports.flatMap((item) => item.rows);
  const drawbackRows = process.drawbackCsvImports.flatMap((item) => item.rows);
  const processCodes = new Set(
    process.items
      .map((item) => item.supplierCode?.trim().toUpperCase())
      .filter(Boolean)
  );
  const portalByCode = new Map(
    portalRows.map((row) => [row.productCode.trim().toUpperCase(), row])
  );
  if (tool === "summarize_portal_data")
    return {
      content: `A base parseada do Portal Único contém ${portalRows.length} produtos em ${process.portalCsvImports.length} importações.`,
      data: {
        imports: process.portalCsvImports.length,
        rows: portalRows.length,
        registered: portalRows.filter((row) =>
          ["REGISTERED", "ATIVO", "CADASTRADO"].includes(row.registrationStatus)
        ).length
      }
    };
  if (tool === "summarize_drawback_balances") {
    const available = drawbackRows.reduce(
      (sum, row) => sum + Number(row.availableBalance),
      0
    );
    return {
      content: `Foram estruturadas ${drawbackRows.length} linhas de drawback, com saldo disponível agregado de ${available}.`,
      data: {
        imports: process.drawbackCsvImports.length,
        rows: drawbackRows.length,
        availableBalance: available
      }
    };
  }
  if (
    [
      "compare_process_items_with_portal_data",
      "identify_portal_registration_gaps",
      "suggest_product_registration_actions"
    ].includes(tool)
  ) {
    const gaps = [...processCodes].filter(
      (code) =>
        !portalByCode.has(String(code)) ||
        !["REGISTERED", "ATIVO", "CADASTRADO"].includes(
          portalByCode.get(String(code))!.registrationStatus
        )
    );
    return {
      content: gaps.length
        ? `${gaps.length} códigos do processo não possuem cadastro ativo confirmado na base parseada do Portal Único.`
        : "Todos os códigos informados no processo possuem cadastro ativo na base parseada disponível.",
      data: {
        processCodes: processCodes.size,
        portalRows: portalRows.length,
        gaps
      },
      suggestions: gaps.map((code) => ({
        type: `PORTAL_REGISTRATION_${code}`,
        title: `Preparar cadastro para ${code}`,
        description: `O código ${code} não possui cadastro ativo confirmado no CSV do Portal Único.`
      }))
    };
  }
  if (tool === "summarize_drawback_coverage") {
    const insufficient = process.items.filter((item) => {
      const row = drawbackRows.find(
        (entry) =>
          entry.productCode.trim().toUpperCase() ===
          item.supplierCode?.trim().toUpperCase()
      );
      return !row || Number(row.availableBalance) < Number(item.quantity);
    });
    return {
      content: insufficient.length
        ? `${insufficient.length} itens não possuem cobertura suficiente na base de drawback parseada.`
        : "A base parseada indica cobertura de saldo para todos os itens com código.",
      data: {
        items: process.items.length,
        drawbackRows: drawbackRows.length,
        insufficient: insufficient.map((item) => ({
          line: item.lineNumber,
          code: item.supplierCode,
          required: item.quantity.toString()
        }))
      },
      suggestions: insufficient.map((item) => ({
        type: `DRAWBACK_COVERAGE_${item.id}`,
        title: `Revisar saldo do item ${item.lineNumber}`,
        description: `O saldo parseado não cobre a quantidade ${item.quantity.toString()} do código ${item.supplierCode ?? "sem código"}.`
      }))
    };
  }
  if (tool === "summarize_process")
    return {
      content: `O processo ${process.reference} possui ${process.items.length} itens, ${process.documents.length} documentos e ${process.inconsistencies.length} inconsistências abertas. ${unmatched.length} itens estão sem correspondência. Fornecedor: ${process.supplier?.name ?? "não definido"}.`,
      data: {
        reference: process.reference,
        status: process.status,
        items: process.items.length,
        documents: process.documents.length,
        openInconsistencies: process.inconsistencies.length,
        unmatchedItems: unmatched.length,
        supplier: process.supplier?.name ?? null
      },
      suggestions: nextSuggestions(
        process.inconsistencies.length,
        unmatched.length,
        Boolean(process.actionPlan)
      )
    };
  if (tool === "list_inconsistencies")
    return {
      content: process.inconsistencies.length
        ? `Encontrei ${process.inconsistencies.length} inconsistências abertas. As mais recentes estão detalhadas na saída estruturada e no painel lateral.`
        : "Não há inconsistências abertas neste momento.",
      data: {
        count: process.inconsistencies.length,
        items: process.inconsistencies.map((item) => ({
          type: item.type,
          severity: item.severity,
          title: item.title
        }))
      }
    };
  if (tool === "list_documents")
    return {
      content: `${process.documents.length} documentos fazem parte do contexto deste processo.${process.documents.some((doc) => doc.status === "PENDING_CLASSIFICATION") ? " Há documentos aguardando confirmação de tipo na conversa." : ""}`,
      data: {
        count: process.documents.length,
        pendingClassification: process.documents.filter(
          (doc) => doc.status === "PENDING_CLASSIFICATION"
        ).length,
        documents: process.documents.map((doc) => ({
          name: doc.fileName,
          detectedType: doc.detectedType,
          confirmedType: doc.confirmedType,
          type: doc.type,
          status: doc.status,
          summary: doc.processingSummary,
          warnings: doc.processingErrors
        }))
      }
    };
  if (tool === "list_unmatched_items")
    return {
      content: unmatched.length
        ? `${unmatched.length} itens ainda não possuem correspondência válida no catálogo.`
        : "Todos os itens possuem correspondência válida no catálogo.",
      data: {
        count: unmatched.length,
        items: unmatched.map((item) => ({
          line: item.lineNumber,
          code: item.supplierCode,
          description: item.description
        }))
      },
      suggestions: unmatched.length
        ? [
            {
              type: "CLASSIFY_ITEMS",
              title: "Classificar itens",
              description:
                "Revise os itens sem correspondência e crie aliases quando necessário."
            }
          ]
        : []
    };
  if (tool === "list_ncm_issues") {
    const items = process.items.filter((item) => !item.ncm?.trim());
    return {
      content: items.length
        ? `${items.length} itens estão sem NCM informado.`
        : "Todos os itens possuem NCM informado.",
      data: {
        count: items.length,
        items: items.map((item) => ({
          line: item.lineNumber,
          code: item.supplierCode,
          description: item.description
        }))
      }
    };
  }
  if (tool === "summarize_drawback")
    return {
      content: process.drawback
        ? `Drawback ${process.drawback.mode}, status ${process.drawback.status}, referência ${process.drawback.referenceCode ?? "não informada"}.`
        : "Este processo ainda não possui registro de drawback.",
      data: process.drawback
        ? {
            mode: process.drawback.mode,
            status: process.drawback.status,
            reference: process.drawback.referenceCode,
            notes: process.drawback.notes
          }
        : { registered: false }
    };
  if (tool === "run_analysis") {
    const findings = analyzeProcess(
      process.items,
      products,
      process.drawback?.status === "DRAFT",
      process.supplierId
    );
    await prisma.$transaction(async (tx) => {
      await tx.inconsistency.deleteMany({
        where: {
          workspaceId,
          importProcessId: processId,
          detectedBy: "SYSTEM",
          status: "OPEN"
        }
      });
      if (findings.length)
        await tx.inconsistency.createMany({
          data: findings.map((finding) => ({
            ...finding,
            workspaceId,
            importProcessId: processId
          }))
        });
      await tx.importProcess.updateMany({
        where: { id: processId, workspaceId },
        data: { status: findings.length ? "PENDING_ACTION" : "COMPLIANT" }
      });
    });
    return {
      content: `Análise executada. Foram identificadas ${findings.length} inconsistências; ${findings.filter((item) => item.type === "CATALOG_NOT_FOUND").length} são de correspondência de produto.`,
      data: {
        findings: findings.length,
        catalogNotFound: findings.filter(
          (item) => item.type === "CATALOG_NOT_FOUND"
        ).length
      },
      suggestions: findings.length
        ? [
            {
              type: "GENERATE_PLAN",
              title: "Gerar plano de ação",
              description:
                "Transforme as inconsistências abertas em ações operacionais."
            }
          ]
        : []
    };
  }
  if (tool === "generate_action_plan") {
    const open = await prisma.inconsistency.findMany({
      where: { workspaceId, importProcessId: processId, status: "OPEN" },
      orderBy: { createdAt: "asc" }
    });
    const groups = new Map<string, typeof open>();
    open.forEach((item) =>
      groups.set(item.type, [...(groups.get(item.type) ?? []), item])
    );
    await prisma.$transaction(async (tx) => {
      const plan = await tx.actionPlan.upsert({
        where: { importProcessId: processId },
        create: {
          workspaceId,
          importProcessId: processId,
          summary: `${open.length} inconsistências abertas requerem ação.`
        },
        update: {
          summary: `${open.length} inconsistências abertas requerem ação.`,
          status: "OPEN",
          generatedBy: "SYSTEM"
        }
      });
      await tx.actionPlanItem.deleteMany({
        where: { workspaceId, actionPlanId: plan.id, status: { not: "DONE" } }
      });
      const entries = [...groups.values()].map((items) => ({
        workspaceId,
        actionPlanId: plan.id,
        ...actionForFinding({
          type: items[0].type,
          severity: items[0].severity,
          title: items[0].title,
          description: items[0].description
        }),
        sourceInconsistencyId: items.length === 1 ? items[0].id : null
      }));
      if (entries.length) await tx.actionPlanItem.createMany({ data: entries });
    });
    return {
      content: `Plano de ação gerado com ${groups.size} frentes para ${open.length} inconsistências abertas.`,
      data: { inconsistencies: open.length, actionGroups: groups.size }
    };
  }
  return {
    content:
      "Sugiro priorizar a análise, resolver itens sem classificação e então regenerar o plano de ação.",
    data: {
      suggestions: nextSuggestions(
        process.inconsistencies.length,
        unmatched.length,
        Boolean(process.actionPlan)
      )
    },
    suggestions: nextSuggestions(
      process.inconsistencies.length,
      unmatched.length,
      Boolean(process.actionPlan)
    )
  };
}

function explain(toolName: ProcessTool, data: Record<string, unknown>) {
  return {
    criteria: [
      "Tool determinística",
      `Regra ${toolName}`,
      "Filtros por workspace e processo"
    ],
    sources: [
      "Processo",
      "Itens",
      "Documentos",
      "Inconsistências",
      "Catálogo",
      "Drawback",
      "CSVs parseados"
    ],
    rules: Object.keys(data),
    limitations: [
      "Sem consulta governamental em tempo real",
      "Sem OCR",
      "Sem LLM",
      "Conclusão limitada aos dados persistidos"
    ]
  };
}

function nextSuggestions(
  inconsistencies: number,
  unmatched: number,
  hasPlan: boolean
) {
  const suggestions = [];
  if (unmatched)
    suggestions.push({
      type: "CLASSIFY_ITEMS",
      title: "Revisar itens sem classificação",
      description: `${unmatched} itens precisam de catálogo ou alias.`
    });
  if (inconsistencies && !hasPlan)
    suggestions.push({
      type: "GENERATE_PLAN",
      title: "Gerar plano de ação",
      description: "Converta as inconsistências abertas em ações acompanháveis."
    });
  if (!inconsistencies)
    suggestions.push({
      type: "RUN_ANALYSIS",
      title: "Rodar análise",
      description: "Atualize a conferência determinística do processo."
    });
  return suggestions;
}
