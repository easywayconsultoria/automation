CREATE TYPE "ConversationStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "ConversationMessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM', 'TOOL');
CREATE TYPE "ConversationAttachmentKind" AS ENUM ('INVOICE', 'PORTAL_UNICO_CSV', 'DRAWBACK_CSV', 'NOTE', 'GENERATED_REPORT', 'OTHER');
CREATE TYPE "ToolExecutionStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');
CREATE TYPE "SuggestedActionStatus" AS ENUM ('OPEN', 'ACCEPTED', 'DISMISSED', 'COMPLETED');

CREATE TABLE "conversations" (
  "id" UUID NOT NULL, "workspace_id" UUID NOT NULL, "import_process_id" UUID NOT NULL,
  "title" TEXT, "status" "ConversationStatus" NOT NULL DEFAULT 'ACTIVE', "created_by" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "conversation_messages" (
  "id" UUID NOT NULL, "conversation_id" UUID NOT NULL, "workspace_id" UUID NOT NULL,
  "role" "ConversationMessageRole" NOT NULL, "content" TEXT NOT NULL, "structured_data" JSONB,
  "created_by" UUID, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "conversation_messages_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "conversation_attachments" (
  "id" UUID NOT NULL, "conversation_id" UUID NOT NULL, "workspace_id" UUID NOT NULL,
  "import_process_id" UUID NOT NULL, "process_document_id" UUID, "kind" "ConversationAttachmentKind" NOT NULL,
  "label" TEXT NOT NULL, "storage_path" TEXT, "metadata" JSONB, "created_by" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "conversation_attachments_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "tool_executions" (
  "id" UUID NOT NULL, "conversation_id" UUID NOT NULL, "workspace_id" UUID NOT NULL,
  "import_process_id" UUID NOT NULL, "tool_name" TEXT NOT NULL, "input" JSONB NOT NULL,
  "output" JSONB, "status" "ToolExecutionStatus" NOT NULL DEFAULT 'RUNNING',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "completed_at" TIMESTAMP(3),
  CONSTRAINT "tool_executions_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "suggested_actions" (
  "id" UUID NOT NULL, "conversation_id" UUID NOT NULL, "workspace_id" UUID NOT NULL,
  "import_process_id" UUID NOT NULL, "type" TEXT NOT NULL, "title" TEXT NOT NULL,
  "description" TEXT NOT NULL, "status" "SuggestedActionStatus" NOT NULL DEFAULT 'OPEN',
  "source_message_id" UUID, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "suggested_actions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "conversations_import_process_id_key" ON "conversations"("import_process_id");
CREATE INDEX "conversations_workspace_id_updated_at_idx" ON "conversations"("workspace_id", "updated_at");
CREATE INDEX "conversation_messages_workspace_id_conversation_id_created_at_idx" ON "conversation_messages"("workspace_id", "conversation_id", "created_at");
CREATE INDEX "conversation_attachments_workspace_id_conversation_id_created_at_idx" ON "conversation_attachments"("workspace_id", "conversation_id", "created_at");
CREATE INDEX "tool_executions_workspace_id_conversation_id_created_at_idx" ON "tool_executions"("workspace_id", "conversation_id", "created_at");
CREATE INDEX "suggested_actions_workspace_id_conversation_id_status_idx" ON "suggested_actions"("workspace_id", "conversation_id", "status");

ALTER TABLE "conversations" ADD CONSTRAINT "conversations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_import_process_id_fkey" FOREIGN KEY ("import_process_id") REFERENCES "import_processes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "conversation_attachments" ADD CONSTRAINT "conversation_attachments_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversation_attachments" ADD CONSTRAINT "conversation_attachments_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversation_attachments" ADD CONSTRAINT "conversation_attachments_import_process_id_fkey" FOREIGN KEY ("import_process_id") REFERENCES "import_processes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversation_attachments" ADD CONSTRAINT "conversation_attachments_process_document_id_fkey" FOREIGN KEY ("process_document_id") REFERENCES "process_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "conversation_attachments" ADD CONSTRAINT "conversation_attachments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tool_executions" ADD CONSTRAINT "tool_executions_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tool_executions" ADD CONSTRAINT "tool_executions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tool_executions" ADD CONSTRAINT "tool_executions_import_process_id_fkey" FOREIGN KEY ("import_process_id") REFERENCES "import_processes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "suggested_actions" ADD CONSTRAINT "suggested_actions_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "suggested_actions" ADD CONSTRAINT "suggested_actions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "suggested_actions" ADD CONSTRAINT "suggested_actions_import_process_id_fkey" FOREIGN KEY ("import_process_id") REFERENCES "import_processes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "suggested_actions" ADD CONSTRAINT "suggested_actions_source_message_id_fkey" FOREIGN KEY ("source_message_id") REFERENCES "conversation_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "conversations" ("id", "workspace_id", "import_process_id", "title", "created_by", "updated_at")
SELECT gen_random_uuid(), p."workspace_id", p."id", 'Conversa · ' || p."reference", p."created_by", CURRENT_TIMESTAMP
FROM "import_processes" p ON CONFLICT ("import_process_id") DO NOTHING;

ALTER TABLE "conversations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "conversation_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "conversation_attachments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tool_executions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "suggested_actions" ENABLE ROW LEVEL SECURITY;
