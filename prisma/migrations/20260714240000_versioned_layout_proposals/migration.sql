CREATE TYPE "CsvLayoutType" AS ENUM ('PORTAL_UNICO','DRAWBACK');
CREATE TYPE "RegistrationProposalStatus" AS ENUM ('DRAFT','PENDING_REVIEW','ACCEPTED','DISMISSED','CONVERTED');

CREATE TABLE "csv_layout_definitions" (
  "id" UUID NOT NULL, "workspace_id" UUID, "name" TEXT NOT NULL, "type" "CsvLayoutType" NOT NULL,
  "version" TEXT NOT NULL, "active" BOOLEAN NOT NULL DEFAULT true, "required_columns" JSONB NOT NULL,
  "optional_columns" JSONB NOT NULL, "expected_order" JSONB NOT NULL, "validation_rules" JSONB NOT NULL,
  "aliases" JSONB, "description" TEXT NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "csv_layout_definitions_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "registration_proposals" (
  "id" UUID NOT NULL, "workspace_id" UUID NOT NULL, "import_process_id" UUID NOT NULL,
  "portal_csv_import_id" UUID, "source_item_id" UUID, "suggested_product_code" TEXT NOT NULL,
  "suggested_description" TEXT NOT NULL, "suggested_ncm" TEXT, "status" "RegistrationProposalStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
  "rationale" TEXT NOT NULL, "created_by" UUID NOT NULL, "reviewed_by" UUID, "reviewed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "registration_proposals_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "registration_proposal_events" (
  "id" UUID NOT NULL, "registration_proposal_id" UUID NOT NULL, "workspace_id" UUID NOT NULL,
  "import_process_id" UUID NOT NULL, "from_status" "RegistrationProposalStatus" NOT NULL,
  "to_status" "RegistrationProposalStatus" NOT NULL, "changes" JSONB, "reason" TEXT,
  "actor_id" UUID NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "registration_proposal_events_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "portal_csv_imports" ADD COLUMN "csv_layout_id" UUID, ADD COLUMN "detected_version" TEXT;
ALTER TABLE "drawback_csv_imports" ADD COLUMN "csv_layout_id" UUID, ADD COLUMN "detected_version" TEXT;

CREATE UNIQUE INDEX "csv_layout_definitions_workspace_id_type_version_key" ON "csv_layout_definitions"("workspace_id","type","version");
CREATE INDEX "csv_layout_definitions_type_active_version_idx" ON "csv_layout_definitions"("type","active","version");
CREATE UNIQUE INDEX "registration_proposals_workspace_id_import_process_id_source_item_id_key" ON "registration_proposals"("workspace_id","import_process_id","source_item_id");
CREATE INDEX "registration_proposals_workspace_id_import_process_id_status_idx" ON "registration_proposals"("workspace_id","import_process_id","status");
CREATE INDEX "registration_proposal_events_workspace_id_registration_proposal_id_created_at_idx" ON "registration_proposal_events"("workspace_id","registration_proposal_id","created_at");

ALTER TABLE "csv_layout_definitions" ADD CONSTRAINT "csv_layout_definitions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "portal_csv_imports" ADD CONSTRAINT "portal_csv_imports_csv_layout_id_fkey" FOREIGN KEY ("csv_layout_id") REFERENCES "csv_layout_definitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "drawback_csv_imports" ADD CONSTRAINT "drawback_csv_imports_csv_layout_id_fkey" FOREIGN KEY ("csv_layout_id") REFERENCES "csv_layout_definitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "registration_proposals" ADD CONSTRAINT "registration_proposals_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "registration_proposals" ADD CONSTRAINT "registration_proposals_import_process_id_fkey" FOREIGN KEY ("import_process_id") REFERENCES "import_processes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "registration_proposals" ADD CONSTRAINT "registration_proposals_portal_csv_import_id_fkey" FOREIGN KEY ("portal_csv_import_id") REFERENCES "portal_csv_imports"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "registration_proposals" ADD CONSTRAINT "registration_proposals_source_item_id_fkey" FOREIGN KEY ("source_item_id") REFERENCES "invoice_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "registration_proposals" ADD CONSTRAINT "registration_proposals_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "registration_proposals" ADD CONSTRAINT "registration_proposals_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "user_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "registration_proposal_events" ADD CONSTRAINT "registration_proposal_events_registration_proposal_id_fkey" FOREIGN KEY ("registration_proposal_id") REFERENCES "registration_proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "registration_proposal_events" ADD CONSTRAINT "registration_proposal_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "registration_proposal_events" ADD CONSTRAINT "registration_proposal_events_import_process_id_fkey" FOREIGN KEY ("import_process_id") REFERENCES "import_processes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "registration_proposal_events" ADD CONSTRAINT "registration_proposal_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "user_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "csv_layout_definitions" ("id","name","type","version","required_columns","optional_columns","expected_order","validation_rules","aliases","description","updated_at") VALUES
('10000000-0000-4000-8000-000000000001','Portal Único','PORTAL_UNICO','1.0','["productCode","description","registrationStatus"]','["ncm"]','["productCode","description","ncm","registrationStatus"]','{"delimiter":",","encoding":"UTF-8"}','{}','Layout canônico inicial do Portal Único',CURRENT_TIMESTAMP),
('10000000-0000-4000-8000-000000000002','Portal Único legado','PORTAL_UNICO','0.9','["codigo_produto","descricao","situacao_cadastro"]','["ncm"]','["codigo_produto","descricao","ncm","situacao_cadastro"]','{"delimiter":",","encoding":"UTF-8"}','{"codigo_produto":"productCode","descricao":"description","situacao_cadastro":"registrationStatus"}','Layout legado em português',CURRENT_TIMESTAMP),
('20000000-0000-4000-8000-000000000001','Drawback','DRAWBACK','1.0','["referenceCode","productCode","grantedQuantity","usedQuantity","availableBalance"]','["ncm","unit"]','["referenceCode","productCode","ncm","grantedQuantity","usedQuantity","availableBalance","unit"]','{"delimiter":",","encoding":"UTF-8"}','{}','Layout canônico inicial de drawback',CURRENT_TIMESTAMP),
('20000000-0000-4000-8000-000000000002','Drawback legado','DRAWBACK','0.9','["ato_concessorio","codigo_produto","quantidade_concedida","quantidade_utilizada","saldo_disponivel"]','["ncm","unidade"]','["ato_concessorio","codigo_produto","ncm","quantidade_concedida","quantidade_utilizada","saldo_disponivel","unidade"]','{"delimiter":",","encoding":"UTF-8"}','{"ato_concessorio":"referenceCode","codigo_produto":"productCode","quantidade_concedida":"grantedQuantity","quantidade_utilizada":"usedQuantity","saldo_disponivel":"availableBalance","unidade":"unit"}','Layout legado em português',CURRENT_TIMESTAMP);

ALTER TABLE "csv_layout_definitions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "registration_proposals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "registration_proposal_events" ENABLE ROW LEVEL SECURITY;
