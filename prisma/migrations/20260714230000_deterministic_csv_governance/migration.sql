CREATE TYPE "CsvImportStatus" AS ENUM ('PROCESSING','COMPLETED','COMPLETED_WITH_ERRORS','FAILED');
ALTER TABLE "tool_executions" ADD COLUMN "criteria" JSONB, ADD COLUMN "sources" JSONB, ADD COLUMN "limitations" JSONB;

CREATE TABLE "suggested_action_events" (
  "id" UUID NOT NULL, "suggested_action_id" UUID NOT NULL, "workspace_id" UUID NOT NULL,
  "import_process_id" UUID NOT NULL, "from_status" "SuggestedActionStatus" NOT NULL,
  "to_status" "SuggestedActionStatus" NOT NULL, "reason" TEXT, "actor_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "suggested_action_events_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "portal_csv_imports" (
  "id" UUID NOT NULL, "workspace_id" UUID NOT NULL, "import_process_id" UUID NOT NULL,
  "process_document_id" UUID NOT NULL, "status" "CsvImportStatus" NOT NULL DEFAULT 'PROCESSING',
  "header" JSONB, "errors" JSONB, "valid_rows" INTEGER NOT NULL DEFAULT 0,
  "invalid_rows" INTEGER NOT NULL DEFAULT 0, "processed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "portal_csv_imports_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "portal_csv_rows" (
  "id" UUID NOT NULL, "portal_csv_import_id" UUID NOT NULL, "workspace_id" UUID NOT NULL,
  "import_process_id" UUID NOT NULL, "line_number" INTEGER NOT NULL, "product_code" TEXT NOT NULL,
  "description" TEXT NOT NULL, "ncm" TEXT, "registration_status" TEXT NOT NULL, "raw_data" JSONB NOT NULL,
  CONSTRAINT "portal_csv_rows_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "drawback_csv_imports" (
  "id" UUID NOT NULL, "workspace_id" UUID NOT NULL, "import_process_id" UUID NOT NULL,
  "process_document_id" UUID NOT NULL, "status" "CsvImportStatus" NOT NULL DEFAULT 'PROCESSING',
  "header" JSONB, "errors" JSONB, "valid_rows" INTEGER NOT NULL DEFAULT 0,
  "invalid_rows" INTEGER NOT NULL DEFAULT 0, "processed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "drawback_csv_imports_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "drawback_csv_rows" (
  "id" UUID NOT NULL, "drawback_csv_import_id" UUID NOT NULL, "workspace_id" UUID NOT NULL,
  "import_process_id" UUID NOT NULL, "line_number" INTEGER NOT NULL, "reference_code" TEXT NOT NULL,
  "product_code" TEXT NOT NULL, "ncm" TEXT, "granted_quantity" DECIMAL(18,6) NOT NULL,
  "used_quantity" DECIMAL(18,6) NOT NULL, "available_balance" DECIMAL(18,6) NOT NULL,
  "unit" TEXT, "raw_data" JSONB NOT NULL, CONSTRAINT "drawback_csv_rows_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "suggested_action_events_workspace_id_suggested_action_id_created_at_idx" ON "suggested_action_events"("workspace_id","suggested_action_id","created_at");
CREATE UNIQUE INDEX "portal_csv_imports_process_document_id_key" ON "portal_csv_imports"("process_document_id");
CREATE INDEX "portal_csv_imports_workspace_id_import_process_id_status_idx" ON "portal_csv_imports"("workspace_id","import_process_id","status");
CREATE INDEX "portal_csv_rows_workspace_id_import_process_id_product_code_idx" ON "portal_csv_rows"("workspace_id","import_process_id","product_code");
CREATE UNIQUE INDEX "drawback_csv_imports_process_document_id_key" ON "drawback_csv_imports"("process_document_id");
CREATE INDEX "drawback_csv_imports_workspace_id_import_process_id_status_idx" ON "drawback_csv_imports"("workspace_id","import_process_id","status");
CREATE INDEX "drawback_csv_rows_workspace_id_import_process_id_product_code_idx" ON "drawback_csv_rows"("workspace_id","import_process_id","product_code");

ALTER TABLE "suggested_action_events" ADD CONSTRAINT "suggested_action_events_suggested_action_id_fkey" FOREIGN KEY ("suggested_action_id") REFERENCES "suggested_actions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "suggested_action_events" ADD CONSTRAINT "suggested_action_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "suggested_action_events" ADD CONSTRAINT "suggested_action_events_import_process_id_fkey" FOREIGN KEY ("import_process_id") REFERENCES "import_processes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "suggested_action_events" ADD CONSTRAINT "suggested_action_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "user_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "portal_csv_imports" ADD CONSTRAINT "portal_csv_imports_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "portal_csv_imports" ADD CONSTRAINT "portal_csv_imports_import_process_id_fkey" FOREIGN KEY ("import_process_id") REFERENCES "import_processes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "portal_csv_imports" ADD CONSTRAINT "portal_csv_imports_process_document_id_fkey" FOREIGN KEY ("process_document_id") REFERENCES "process_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "portal_csv_rows" ADD CONSTRAINT "portal_csv_rows_portal_csv_import_id_fkey" FOREIGN KEY ("portal_csv_import_id") REFERENCES "portal_csv_imports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "portal_csv_rows" ADD CONSTRAINT "portal_csv_rows_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "portal_csv_rows" ADD CONSTRAINT "portal_csv_rows_import_process_id_fkey" FOREIGN KEY ("import_process_id") REFERENCES "import_processes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "drawback_csv_imports" ADD CONSTRAINT "drawback_csv_imports_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "drawback_csv_imports" ADD CONSTRAINT "drawback_csv_imports_import_process_id_fkey" FOREIGN KEY ("import_process_id") REFERENCES "import_processes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "drawback_csv_imports" ADD CONSTRAINT "drawback_csv_imports_process_document_id_fkey" FOREIGN KEY ("process_document_id") REFERENCES "process_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "drawback_csv_rows" ADD CONSTRAINT "drawback_csv_rows_drawback_csv_import_id_fkey" FOREIGN KEY ("drawback_csv_import_id") REFERENCES "drawback_csv_imports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "drawback_csv_rows" ADD CONSTRAINT "drawback_csv_rows_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "drawback_csv_rows" ADD CONSTRAINT "drawback_csv_rows_import_process_id_fkey" FOREIGN KEY ("import_process_id") REFERENCES "import_processes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "suggested_action_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "portal_csv_imports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "portal_csv_rows" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "drawback_csv_imports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "drawback_csv_rows" ENABLE ROW LEVEL SECURITY;
