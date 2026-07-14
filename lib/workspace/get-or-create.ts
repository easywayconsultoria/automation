import { Prisma } from "@prisma/client";
import type { User } from "@supabase/supabase-js";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";

export async function getOrCreateWorkspace(user: User) {
  const displayName =
    typeof user.user_metadata.full_name === "string"
      ? user.user_metadata.full_name
      : null;
  const email = user.email ?? "unknown@example.invalid";

  try {
    return await prisma.$transaction(async (tx) => {
      await tx.userProfile.upsert({
        where: { id: user.id },
        create: { id: user.id, email, displayName },
        update: { email, displayName }
      });
      const existing = await tx.workspace.findFirst({
        where: { members: { some: { userId: user.id } } },
        include: { members: { where: { userId: user.id } } }
      });
      if (existing) return existing;
      const workspace = await tx.workspace.create({
        data: {
          name: displayName
            ? `Workspace de ${displayName}`
            : "Workspace EasyWay",
          ownerId: user.id,
          members: { create: { userId: user.id, role: "OWNER" } },
          auditLogs: {
            create: {
              actorId: user.id,
              event: "workspace_created",
              metadata: { source: "first_login" }
            }
          }
        },
        include: { members: true }
      });
      return workspace;
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const workspace = await prisma.workspace.findFirst({
        where: { members: { some: { userId: user.id } } },
        include: { members: { where: { userId: user.id } } }
      });
      if (workspace) return workspace;
    }
    logger.error("workspace_bootstrap_failed", {
      userId: user.id,
      error: error instanceof Error ? error.message : "unknown"
    });
    throw error;
  }
}
