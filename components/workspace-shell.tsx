import Link from "next/link";
import type { ReactNode } from "react";
import { logout } from "@/app/actions/auth";

const links = [
  ["Dashboard", "/workspace"],
  ["Processos", "/workspace/processes"],
  ["Catálogo", "/workspace/catalog"],
  ["Fornecedores", "/workspace/suppliers"],
  ["Conformidade", "/workspace/conformity"],
  ["Drawback", "/workspace/drawback"]
];

export function WorkspaceShell({
  workspaceName,
  userName,
  email,
  showLayoutAdmin,
  children
}: {
  workspaceName: string;
  userName: string;
  email?: string;
  showLayoutAdmin?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-paper md:grid md:grid-cols-[250px_1fr]">
      <aside className="border-b border-slate-200 bg-ink px-5 py-6 text-white md:min-h-screen md:border-b-0">
        <div className="mb-8">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">
            EasyWay AI
          </p>
          <p className="mt-2 truncate font-semibold">{workspaceName}</p>
        </div>
        <nav
          aria-label="Navegação principal"
          className="flex gap-2 overflow-x-auto md:block md:space-y-1"
        >
          {links.map(([label, href]) => (
            <Link
              key={href}
              href={href}
              className="block whitespace-nowrap rounded-lg px-3 py-2 text-sm text-slate-200 hover:bg-white/10 hover:text-white"
            >
              {label}
            </Link>
          ))}
          {showLayoutAdmin && (
            <Link
              href="/workspace/admin/layouts"
              className="block whitespace-nowrap rounded-lg px-3 py-2 text-sm text-emerald-300 hover:bg-white/10 hover:text-white"
            >
              Admin · Layouts
            </Link>
          )}
        </nav>
      </aside>
      <main>
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4 lg:px-10">
          <div>
            <p className="font-semibold">{userName}</p>
            <p className="text-sm text-slate-500">{email}</p>
          </div>
          <form action={logout}>
            <button className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50">
              Sair
            </button>
          </form>
        </header>
        <div className="p-6 lg:p-10">{children}</div>
      </main>
    </div>
  );
}
