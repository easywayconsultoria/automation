ALTER TYPE "DocumentType" ADD VALUE 'XLSX_OPERATIONAL';
ALTER TYPE "DocumentType" ADD VALUE 'XML_OPERATIONAL';
ALTER TYPE "DocumentStatus" ADD VALUE 'PENDING_CLASSIFICATION';

ALTER TABLE "process_documents"
  ADD COLUMN "detected_type" "DocumentType",
  ADD COLUMN "confirmed_type" "DocumentType",
  ADD COLUMN "processing_summary" JSONB,
  ADD COLUMN "processing_errors" JSONB,
  ADD COLUMN "type_confirmed_by" UUID,
  ADD COLUMN "type_confirmed_at" TIMESTAMP(3);

ALTER TABLE "process_documents"
  ADD CONSTRAINT "process_documents_type_confirmed_by_fkey"
  FOREIGN KEY ("type_confirmed_by") REFERENCES "user_profiles"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "process_documents_workspace_id_status_detected_type_idx"
  ON "process_documents"("workspace_id", "status", "detected_type");
