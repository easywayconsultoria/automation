CREATE TABLE "suppliers" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "normalized_name" TEXT NOT NULL,
  "external_code" TEXT,
  "country" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "import_processes" ADD COLUMN "supplier_id" UUID;
ALTER TABLE "product_aliases" ADD COLUMN "supplier_id" UUID;
ALTER TABLE "product_aliases" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX "suppliers_workspace_id_normalized_name_key" ON "suppliers"("workspace_id", "normalized_name");
CREATE INDEX "suppliers_workspace_id_active_name_idx" ON "suppliers"("workspace_id", "active", "name");
CREATE INDEX "suppliers_workspace_id_external_code_idx" ON "suppliers"("workspace_id", "external_code");
CREATE INDEX "import_processes_workspace_id_supplier_id_idx" ON "import_processes"("workspace_id", "supplier_id");
CREATE INDEX "product_aliases_workspace_id_supplier_id_supplier_code_idx" ON "product_aliases"("workspace_id", "supplier_id", "supplier_code");

ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "import_processes" ADD CONSTRAINT "import_processes_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "product_aliases" ADD CONSTRAINT "product_aliases_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "suppliers" ENABLE ROW LEVEL SECURITY;
