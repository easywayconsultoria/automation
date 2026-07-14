import {
  createCatalogProduct,
  createProductAlias,
  toggleCatalogProduct,
  updateCatalogProduct,
  updateProductAlias
} from "@/app/actions/domain";
import { requireWorkspace } from "@/lib/auth/context";
import { prisma } from "@/lib/db/prisma";

export default async function CatalogPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string; aliasQ?: string; message?: string }>;
}) {
  const { workspace } = await requireWorkspace();
  const { q = "", aliasQ = "", message } = await searchParams;
  const [products, aliases] = await Promise.all([
    prisma.productCatalog.findMany({
      where: {
        workspaceId: workspace.id,
        ...(q
          ? {
              OR: ["internalCode", "description", "ncm"].map((field) => ({
                [field]: { contains: q, mode: "insensitive" as const }
              }))
            }
          : {})
      },
      include: { _count: { select: { aliases: true, invoiceItems: true } } },
      orderBy: [{ active: "desc" }, { internalCode: "asc" }]
    }),
    prisma.productAlias.findMany({
      where: {
        workspaceId: workspace.id,
        ...(aliasQ
          ? {
              OR: [
                { supplierCode: { contains: aliasQ, mode: "insensitive" } },
                {
                  supplierDescription: {
                    contains: aliasQ,
                    mode: "insensitive"
                  }
                }
              ]
            }
          : {})
      },
      include: { productCatalog: true, supplier: true },
      orderBy: { createdAt: "desc" }
    })
  ]);
  const [allProducts, suppliers] = await Promise.all([
    prisma.productCatalog.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { internalCode: "asc" }
    }),
    prisma.supplier.findMany({
      where: { workspaceId: workspace.id, active: true },
      orderBy: { name: "asc" }
    })
  ]);

  return (
    <>
      <div>
        <p className="text-sm font-semibold text-brand">
          Classificação operacional
        </p>
        <h1 className="mt-1 text-3xl font-semibold">Catálogo de produtos</h1>
        <p className="mt-2 text-slate-600">
          Produtos e aliases exclusivos deste workspace, usados na análise dos
          itens.
        </p>
      </div>
      {message && (
        <p className="mt-5 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </p>
      )}

      <section className="mt-8 grid gap-5 xl:grid-cols-[360px_1fr]">
        <ProductForm />
        <div>
          <SearchForm
            name="q"
            value={q}
            placeholder="Buscar código, descrição ou NCM"
          />
          <div className="mt-3 space-y-3">
            {products.map((product) => (
              <details
                key={product.id}
                className="rounded-xl border bg-white p-5"
              >
                <summary className="cursor-pointer list-none">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">
                        {product.internalCode} · {product.description}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        NCM {product.ncm ?? "—"} ·{" "}
                        {product.defaultUnit ?? "sem unidade"} ·{" "}
                        {product._count.aliases} aliases ·{" "}
                        {product._count.invoiceItems} itens
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-bold ${product.active ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}
                    >
                      {product.active ? "ATIVO" : "INATIVO"}
                    </span>
                  </div>
                </summary>
                <div className="mt-5 border-t pt-5">
                  <ProductForm product={product} />
                  <form action={toggleCatalogProduct} className="mt-3">
                    <input type="hidden" name="productId" value={product.id} />
                    <button className="text-sm font-semibold text-brand hover:underline">
                      {product.active ? "Desativar produto" : "Ativar produto"}
                    </button>
                  </form>
                </div>
              </details>
            ))}
            {!products.length && <Empty text="Nenhum produto encontrado." />}
          </div>
        </div>
      </section>

      <section className="mt-14 border-t pt-10">
        <h2 className="text-2xl font-semibold">Aliases de fornecedor</h2>
        <p className="mt-1 text-sm text-slate-500">
          Variações determinísticas que apontam para um produto do catálogo.
        </p>
        <div className="mt-5 grid gap-5 xl:grid-cols-[360px_1fr]">
          <AliasForm products={allProducts} suppliers={suppliers} />
          <div>
            <SearchForm
              name="aliasQ"
              value={aliasQ}
              placeholder="Buscar código ou descrição do fornecedor"
            />
            <div className="mt-3 space-y-3">
              {aliases.map((alias) => (
                <details
                  key={alias.id}
                  className="rounded-xl border bg-white p-5"
                >
                  <summary className="cursor-pointer list-none">
                    <p className="font-semibold">
                      {alias.supplierCode ?? "Sem código"} ·{" "}
                      {alias.supplierDescription ?? "Sem descrição"}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      → {alias.productCatalog.internalCode} ·{" "}
                      {alias.productCatalog.description}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-brand">
                      {alias.supplier
                        ? `Específico: ${alias.supplier.name}`
                        : "Alias global"}
                    </p>
                  </summary>
                  <div className="mt-5 border-t pt-5">
                    <AliasForm
                      alias={alias}
                      products={allProducts}
                      suppliers={suppliers}
                    />
                  </div>
                </details>
              ))}
              {!aliases.length && <Empty text="Nenhum alias encontrado." />}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

type ProductValue = {
  id: string;
  internalCode: string;
  description: string;
  ncm: string | null;
  defaultUnit: string | null;
};
function ProductForm({ product }: { product?: ProductValue }) {
  return (
    <form
      action={product ? updateCatalogProduct : createCatalogProduct}
      className="grid gap-3 rounded-xl border bg-white p-5"
    >
      {product && <input type="hidden" name="productId" value={product.id} />}
      <h2 className="font-semibold">
        {product ? "Editar produto" : "Novo produto"}
      </h2>
      <Field
        name="internalCode"
        label="Código interno *"
        defaultValue={product?.internalCode}
        required
      />
      <Field
        name="description"
        label="Descrição *"
        defaultValue={product?.description}
        required
      />
      <div className="grid grid-cols-2 gap-3">
        <Field name="ncm" label="NCM" defaultValue={product?.ncm ?? ""} />
        <Field
          name="defaultUnit"
          label="Unidade padrão"
          defaultValue={product?.defaultUnit ?? ""}
        />
      </div>
      <button className="rounded-lg bg-brand px-4 py-2.5 font-semibold text-white">
        {product ? "Salvar alterações" : "Criar produto"}
      </button>
    </form>
  );
}

type AliasValue = {
  id: string;
  supplierCode: string | null;
  supplierDescription: string | null;
  confidenceHint: { toString(): string } | null;
  productCatalogId: string;
  supplierId: string | null;
};
function AliasForm({
  alias,
  products,
  suppliers
}: {
  alias?: AliasValue;
  products: ProductValue[];
  suppliers: { id: string; name: string }[];
}) {
  return (
    <form
      action={alias ? updateProductAlias : createProductAlias}
      className="grid gap-3 rounded-xl border bg-white p-5"
    >
      {alias && <input type="hidden" name="aliasId" value={alias.id} />}
      <h3 className="font-semibold">{alias ? "Editar alias" : "Novo alias"}</h3>
      <Field
        name="supplierCode"
        label="Código do fornecedor"
        defaultValue={alias?.supplierCode ?? ""}
      />
      <Field
        name="supplierDescription"
        label="Descrição do fornecedor"
        defaultValue={alias?.supplierDescription ?? ""}
      />
      <label className="text-sm font-medium">
        Escopo do fornecedor
        <select
          name="supplierId"
          defaultValue={alias?.supplierId ?? ""}
          className="mt-2 w-full rounded-lg border px-3 py-2"
        >
          <option value="">Global — qualquer fornecedor</option>
          {suppliers.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm font-medium">
        Produto vinculado *
        <select
          name="productCatalogId"
          defaultValue={alias?.productCatalogId}
          required
          className="mt-2 w-full rounded-lg border px-3 py-2"
        >
          <option value="">Selecione</option>
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.internalCode} · {product.description}
            </option>
          ))}
        </select>
      </label>
      <Field
        name="confidenceHint"
        label="Confiança (0 a 1)"
        type="number"
        min="0"
        max="1"
        step="0.0001"
        defaultValue={alias?.confidenceHint?.toString() ?? ""}
      />
      <button
        disabled={!products.length}
        className="rounded-lg bg-brand px-4 py-2.5 font-semibold text-white disabled:opacity-50"
      >
        {alias ? "Salvar alterações" : "Criar alias"}
      </button>
      {!products.length && (
        <p className="text-xs text-amber-700">
          Crie um produto antes do primeiro alias.
        </p>
      )}
    </form>
  );
}

function Field(
  props: React.InputHTMLAttributes<HTMLInputElement> & { label: string }
) {
  const { label, ...input } = props;
  return (
    <label className="text-sm font-medium">
      {label}
      <input {...input} className="mt-2 w-full rounded-lg border px-3 py-2" />
    </label>
  );
}
function SearchForm({
  name,
  value,
  placeholder
}: {
  name: string;
  value: string;
  placeholder: string;
}) {
  return (
    <form className="flex gap-2">
      <input
        name={name}
        defaultValue={value}
        placeholder={placeholder}
        className="w-full rounded-lg border bg-white px-4 py-2.5 text-sm"
      />
      <button className="rounded-lg border bg-white px-4 py-2 text-sm font-semibold">
        Buscar
      </button>
    </form>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <p className="rounded-lg border border-dashed bg-white p-6 text-sm text-slate-500">
      {text}
    </p>
  );
}
