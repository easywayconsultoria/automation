import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { logout } from "@/app/actions/auth";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateWorkspace } from "@/lib/workspace/get-or-create";

export const metadata: Metadata = { title: "Workspace" };
const sections = [
  "Dashboard",
  "Processos",
  "OCR",
  "CSV",
  "Conformidade",
  "Drawback",
  "Configurações"
];

export default async function WorkspacePage() {
  const supabase = await createClient();
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();
  if (error || !user) redirect("/login");
  const workspace = await getOrCreateWorkspace(user);
  const displayName =
    typeof user.user_metadata.full_name === "string"
      ? user.user_metadata.full_name
      : user.email;

  return (
    <div className="min-h-screen bg-paper md:grid md:grid-cols-[250px_1fr]">
      <aside className="border-b border-slate-200 bg-ink px-5 py-6 text-white md:min-h-screen md:border-b-0">
        <div className="mb-8">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">
            EasyWay AI
          </p>
          <p className="mt-2 truncate font-semibold">{workspace.name}</p>
        </div>
        <nav
          aria-label="Navegação principal"
          className="flex gap-2 overflow-x-auto md:block md:space-y-1"
        >
          {sections.map((section, index) => (
            <span
              key={section}
              className={`block whitespace-nowrap rounded-lg px-3 py-2 text-sm ${index === 0 ? "bg-white/15 font-medium" : "text-slate-300"}`}
            >
              {section}
            </span>
          ))}
        </nav>
      </aside>
      <main>
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4 lg:px-10">
          <div>
            <p className="font-semibold">{displayName}</p>
            <p className="text-sm text-slate-500">{user.email}</p>
          </div>
          <form action={logout}>
            <button className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50">
              Sair
            </button>
          </form>
        </header>
        <div className="p-6 lg:p-10">
          <div className="mb-8">
            <p className="text-sm font-semibold text-brand">Dashboard</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">
              Seu workspace está pronto
            </h1>
            <p className="mt-2 max-w-2xl text-slate-600">
              Esta é a base segura para centralizar processos, documentos e
              verificações da EasyWay.
            </p>
          </div>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[
              [
                "Processos",
                "Nenhum processo cadastrado",
                "Organize operações de importação e exportação."
              ],
              [
                "Documentos",
                "Pronto para receber arquivos",
                "OCR e extração de invoices serão conectados aqui."
              ],
              [
                "Conformidade",
                "Sem análises pendentes",
                "Cruze dados e acompanhe validações regulatórias."
              ]
            ].map(([title, state, description]) => (
              <article
                key={title}
                className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <p className="text-sm font-medium text-slate-500">{title}</p>
                <h2 className="mt-4 text-lg font-semibold">{state}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {description}
                </p>
              </article>
            ))}
          </section>
        </div>
      </main>
    </div>
  );
}
