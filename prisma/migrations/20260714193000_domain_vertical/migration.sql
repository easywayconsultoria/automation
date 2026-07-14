CREATE TYPE "ImportProcessStatus" AS ENUM ('DRAFT','IN_REVIEW','PENDING_ACTION','COMPLIANT','CLOSED');
CREATE TYPE "DocumentType" AS ENUM ('INVOICE','PACKING_LIST','CSV','DECLARATION','SUPPORT_DOC','OTHER');
CREATE TYPE "DocumentSource" AS ENUM ('UPLOAD','MANUAL','GENERATED');
CREATE TYPE "DocumentStatus" AS ENUM ('UPLOADED','PARSED','FAILED','REVIEWED');
CREATE TYPE "InconsistencySeverity" AS ENUM ('LOW','MEDIUM','HIGH','CRITICAL');
CREATE TYPE "InconsistencyStatus" AS ENUM ('OPEN','ACCEPTED','DISMISSED','RESOLVED');
CREATE TYPE "DetectedBy" AS ENUM ('SYSTEM','USER');
CREATE TYPE "ActionPlanStatus" AS ENUM ('OPEN','IN_PROGRESS','COMPLETED');
CREATE TYPE "GeneratedBy" AS ENUM ('SYSTEM','USER');
CREATE TYPE "ActionPriority" AS ENUM ('LOW','MEDIUM','HIGH');
CREATE TYPE "ActionItemStatus" AS ENUM ('OPEN','DOING','DONE');
CREATE TYPE "DrawbackMode" AS ENUM ('ISENCAO','SUSPENSAO');
CREATE TYPE "DrawbackStatus" AS ENUM ('DRAFT','UNDER_REVIEW','REGULAR','IRREGULAR');

CREATE TABLE "import_processes" (
  "id" UUID NOT NULL, "workspace_id" UUID NOT NULL, "reference" TEXT NOT NULL,
  "client_name" TEXT NOT NULL, "exporter_name" TEXT, "status" "ImportProcessStatus" NOT NULL DEFAULT 'DRAFT',
  "origin_country" TEXT, "incoterm" TEXT, "invoice_number" TEXT, "notes" TEXT,
  "created_by" UUID NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "import_processes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "process_documents" (
  "id" UUID NOT NULL, "workspace_id" UUID NOT NULL, "import_process_id" UUID NOT NULL,
  "type" "DocumentType" NOT NULL, "file_name" TEXT NOT NULL, "mime_type" TEXT NOT NULL,
  "storage_path" TEXT, "source" "DocumentSource" NOT NULL DEFAULT 'UPLOAD', "uploaded_by" UUID NOT NULL,
  "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "parsed_at" TIMESTAMP(3),
  "status" "DocumentStatus" NOT NULL DEFAULT 'UPLOADED', CONSTRAINT "process_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "invoice_items" (
  "id" UUID NOT NULL, "workspace_id" UUID NOT NULL, "import_process_id" UUID NOT NULL,
  "process_document_id" UUID, "line_number" INTEGER NOT NULL, "supplier_code" TEXT,
  "description" TEXT NOT NULL, "ncm" TEXT, "quantity" DECIMAL(18,6) NOT NULL, "unit" TEXT,
  "unit_price" DECIMAL(18,6) NOT NULL, "total_price" DECIMAL(18,2) NOT NULL,
  "gross_weight" DECIMAL(18,6), "net_weight" DECIMAL(18,6), "currency" TEXT NOT NULL DEFAULT 'USD',
  "country_of_origin" TEXT, "raw_data" JSONB, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "product_catalog" (
  "id" UUID NOT NULL, "workspace_id" UUID NOT NULL, "internal_code" TEXT NOT NULL,
  "description" TEXT NOT NULL, "ncm" TEXT, "default_unit" TEXT, "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "product_catalog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "product_aliases" (
  "id" UUID NOT NULL, "workspace_id" UUID NOT NULL, "product_catalog_id" UUID NOT NULL,
  "supplier_code" TEXT, "supplier_description" TEXT, "confidence_hint" DECIMAL(5,4),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "product_aliases_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inconsistencies" (
  "id" UUID NOT NULL, "workspace_id" UUID NOT NULL, "import_process_id" UUID NOT NULL,
  "invoice_item_id" UUID, "type" TEXT NOT NULL, "severity" "InconsistencySeverity" NOT NULL,
  "title" TEXT NOT NULL, "description" TEXT NOT NULL, "detected_by" "DetectedBy" NOT NULL DEFAULT 'SYSTEM',
  "status" "InconsistencyStatus" NOT NULL DEFAULT 'OPEN', "resolution_note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "inconsistencies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "action_plans" (
  "id" UUID NOT NULL, "workspace_id" UUID NOT NULL, "import_process_id" UUID NOT NULL,
  "summary" TEXT NOT NULL, "status" "ActionPlanStatus" NOT NULL DEFAULT 'OPEN',
  "generated_by" "GeneratedBy" NOT NULL DEFAULT 'SYSTEM', "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "action_plans_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "action_plan_items" (
  "id" UUID NOT NULL, "action_plan_id" UUID NOT NULL, "workspace_id" UUID NOT NULL,
  "title" TEXT NOT NULL, "description" TEXT NOT NULL, "priority" "ActionPriority" NOT NULL,
  "status" "ActionItemStatus" NOT NULL DEFAULT 'OPEN', "owner_user_id" UUID, "due_date" TIMESTAMP(3),
  "source_inconsistency_id" UUID, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "action_plan_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "drawback_records" (
  "id" UUID NOT NULL, "workspace_id" UUID NOT NULL, "import_process_id" UUID NOT NULL,
  "mode" "DrawbackMode" NOT NULL, "reference_code" TEXT, "status" "DrawbackStatus" NOT NULL DEFAULT 'DRAFT',
  "notes" TEXT, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "drawback_records_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "import_processes_workspace_id_status_created_at_idx" ON "import_processes"("workspace_id","status","created_at");
CREATE UNIQUE INDEX "import_processes_workspace_id_reference_key" ON "import_processes"("workspace_id","reference");
CREATE INDEX "process_documents_workspace_id_import_process_id_uploaded_a_idx" ON "process_documents"("workspace_id","import_process_id","uploaded_at");
CREATE INDEX "invoice_items_workspace_id_import_process_id_idx" ON "invoice_items"("workspace_id","import_process_id");
CREATE UNIQUE INDEX "invoice_items_import_process_id_line_number_key" ON "invoice_items"("import_process_id","line_number");
CREATE INDEX "product_catalog_workspace_id_active_idx" ON "product_catalog"("workspace_id","active");
CREATE UNIQUE INDEX "product_catalog_workspace_id_internal_code_key" ON "product_catalog"("workspace_id","internal_code");
CREATE INDEX "product_aliases_workspace_id_supplier_code_idx" ON "product_aliases"("workspace_id","supplier_code");
CREATE INDEX "inconsistencies_workspace_id_import_process_id_status_sever_idx" ON "inconsistencies"("workspace_id","import_process_id","status","severity");
CREATE UNIQUE INDEX "action_plans_import_process_id_key" ON "action_plans"("import_process_id");
CREATE INDEX "action_plans_workspace_id_status_idx" ON "action_plans"("workspace_id","status");
CREATE INDEX "action_plan_items_workspace_id_action_plan_id_status_idx" ON "action_plan_items"("workspace_id","action_plan_id","status");
CREATE UNIQUE INDEX "drawback_records_import_process_id_key" ON "drawback_records"("import_process_id");
CREATE INDEX "drawback_records_workspace_id_status_idx" ON "drawback_records"("workspace_id","status");

ALTER TABLE "import_processes" ADD CONSTRAINT "import_processes_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "import_processes" ADD CONSTRAINT "import_processes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "process_documents" ADD CONSTRAINT "process_documents_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "process_documents" ADD CONSTRAINT "process_documents_import_process_id_fkey" FOREIGN KEY ("import_process_id") REFERENCES "import_processes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "process_documents" ADD CONSTRAINT "process_documents_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "user_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_import_process_id_fkey" FOREIGN KEY ("import_process_id") REFERENCES "import_processes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_process_document_id_fkey" FOREIGN KEY ("process_document_id") REFERENCES "process_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "product_catalog" ADD CONSTRAINT "product_catalog_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_aliases" ADD CONSTRAINT "product_aliases_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_aliases" ADD CONSTRAINT "product_aliases_product_catalog_id_fkey" FOREIGN KEY ("product_catalog_id") REFERENCES "product_catalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inconsistencies" ADD CONSTRAINT "inconsistencies_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inconsistencies" ADD CONSTRAINT "inconsistencies_import_process_id_fkey" FOREIGN KEY ("import_process_id") REFERENCES "import_processes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inconsistencies" ADD CONSTRAINT "inconsistencies_invoice_item_id_fkey" FOREIGN KEY ("invoice_item_id") REFERENCES "invoice_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "action_plans" ADD CONSTRAINT "action_plans_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "action_plans" ADD CONSTRAINT "action_plans_import_process_id_fkey" FOREIGN KEY ("import_process_id") REFERENCES "import_processes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "action_plan_items" ADD CONSTRAINT "action_plan_items_action_plan_id_fkey" FOREIGN KEY ("action_plan_id") REFERENCES "action_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "action_plan_items" ADD CONSTRAINT "action_plan_items_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "action_plan_items" ADD CONSTRAINT "action_plan_items_source_inconsistency_id_fkey" FOREIGN KEY ("source_inconsistency_id") REFERENCES "inconsistencies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "drawback_records" ADD CONSTRAINT "drawback_records_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "drawback_records" ADD CONSTRAINT "drawback_records_import_process_id_fkey" FOREIGN KEY ("import_process_id") REFERENCES "import_processes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "import_processes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "process_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invoice_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_catalog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_aliases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inconsistencies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "action_plans" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "action_plan_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "drawback_records" ENABLE ROW LEVEL SECURITY;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('process-documents','process-documents',false,4194304,ARRAY['application/pdf','text/csv','text/plain','image/png','image/jpeg'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "workspace members upload process documents" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id='process-documents' AND EXISTS (
  SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id=(storage.foldername(name))[1]::uuid AND wm.user_id=auth.uid()
));
CREATE POLICY "workspace members read process documents" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id='process-documents' AND EXISTS (
  SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id=(storage.foldername(name))[1]::uuid AND wm.user_id=auth.uid()
));
