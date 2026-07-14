ALTER TABLE "invoice_items"
ADD COLUMN "product_catalog_id" UUID;

CREATE INDEX "invoice_items_workspace_id_product_catalog_id_idx"
ON "invoice_items"("workspace_id", "product_catalog_id");

ALTER TABLE "invoice_items"
ADD CONSTRAINT "invoice_items_product_catalog_id_fkey"
FOREIGN KEY ("product_catalog_id") REFERENCES "product_catalog"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
