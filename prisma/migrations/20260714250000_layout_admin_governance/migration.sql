CREATE TYPE "CsvLayoutStatus" AS ENUM ('DRAFT','TESTING','ACTIVE','INACTIVE','DEPRECATED');
ALTER TABLE "csv_layout_definitions" ADD COLUMN "status" "CsvLayoutStatus" NOT NULL DEFAULT 'DRAFT';
UPDATE "csv_layout_definitions" SET "status" = CASE WHEN "active" THEN 'ACTIVE'::"CsvLayoutStatus" ELSE 'INACTIVE'::"CsvLayoutStatus" END;
ALTER TABLE "csv_layout_definitions" ALTER COLUMN "active" SET DEFAULT false;
CREATE INDEX "csv_layout_definitions_type_status_version_idx" ON "csv_layout_definitions"("type","status","version");

-- Expand/contract rollout: keep the legacy `active` column and its index until
-- every production deployment reads `status`. A later migration may remove it.

CREATE TABLE "csv_layout_status_events" (
  "id" UUID NOT NULL, "csv_layout_id" UUID NOT NULL, "workspace_id" UUID,
  "from_status" "CsvLayoutStatus" NOT NULL, "to_status" "CsvLayoutStatus" NOT NULL,
  "reason" TEXT, "actor_id" UUID NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "csv_layout_status_events_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "csv_layout_sandbox_tests" (
  "id" UUID NOT NULL, "csv_layout_id" UUID NOT NULL, "workspace_id" UUID NOT NULL,
  "actor_id" UUID NOT NULL, "file_name" TEXT NOT NULL, "detected_header" JSONB NOT NULL,
  "mapped_header" JSONB NOT NULL, "valid_rows" INTEGER NOT NULL, "invalid_rows" INTEGER NOT NULL,
  "errors" JSONB NOT NULL, "preview" JSONB NOT NULL, "passed" BOOLEAN NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "csv_layout_sandbox_tests_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "csv_layout_status_events_csv_layout_id_created_at_idx" ON "csv_layout_status_events"("csv_layout_id","created_at");
CREATE INDEX "csv_layout_sandbox_tests_workspace_id_csv_layout_id_created_at_idx" ON "csv_layout_sandbox_tests"("workspace_id","csv_layout_id","created_at");

ALTER TABLE "csv_layout_status_events" ADD CONSTRAINT "csv_layout_status_events_csv_layout_id_fkey" FOREIGN KEY ("csv_layout_id") REFERENCES "csv_layout_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "csv_layout_status_events" ADD CONSTRAINT "csv_layout_status_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "csv_layout_status_events" ADD CONSTRAINT "csv_layout_status_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "user_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "csv_layout_sandbox_tests" ADD CONSTRAINT "csv_layout_sandbox_tests_csv_layout_id_fkey" FOREIGN KEY ("csv_layout_id") REFERENCES "csv_layout_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "csv_layout_sandbox_tests" ADD CONSTRAINT "csv_layout_sandbox_tests_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "csv_layout_sandbox_tests" ADD CONSTRAINT "csv_layout_sandbox_tests_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "user_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "csv_layout_status_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "csv_layout_sandbox_tests" ENABLE ROW LEVEL SECURITY;
