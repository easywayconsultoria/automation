import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";

export async function writeAudit(
  event: string,
  actorId?: string,
  workspaceId?: string,
  metadata?: Record<string, string>
) {
  try {
    await prisma.auditLog.create({
      data: { event, actorId, workspaceId, metadata }
    });
  } catch (error) {
    logger.warn("audit_write_failed", {
      event,
      actorId,
      error: error instanceof Error ? error.message : "unknown"
    });
  }
}
