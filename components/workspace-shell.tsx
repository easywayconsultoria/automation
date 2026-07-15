import Link from "next/link";
import type { ReactNode } from "react";
import { logout } from "@/app/actions/auth";

type ProcessLink = {
  id: string;
  title: string;
  reference: string;
  status: string;
};

export function WorkspaceShell({
  workspaceName,
  userName,
  email,
  showLayoutAdmin,
  processes,
  children
}: {
  workspaceName: string;
  userName: string;
  email?: string;
  showLayoutAdmin?: boolean;
  processes: ProcessLink[];
  children: ReactNode;
}) {
  return (
    <div className="h-dvh overflow-hidden bg-white md:grid md:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="hidden h-dvh flex-col border-r border-slate-200 bg-[#f7f7f5] md:flex">
        <div className="p-3">
          <Link
            href="/workspace"
            className="flex items-center gap-3 rounded-xl px-3 py-3 hover:bg-white"
          >
            <span className="grid size-9 place-items-center rounded-xl bg-ink font-black text-emerald-300">
              E
            </span>
            <div className="min-w-0">
              <p className="font-semibold">EasyWay AI</p>
              <p className="truncate text-xs text-slate-500">{workspaceName}</p>
            </div>
          </Link>
          <Link
            href="/workspace"
            className="mt-3 flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold shadow-sm hover:border-slate-300"
          >
            <span className="text-lg">＋</span> Nova conversa
          </Link>
        </div>
        <p className="px-4 pb-2 pt-3 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
          Conversas
        </p>
        <nav
          className="flex-1 space-y-1 overflow-y-auto px-3 pb-4"
          aria-label="Conversas e processos"
        >
          {processes.map((process) => (
            <Link
              key={process.id}
              href={`/workspace/chat/${process.id}`}
              className="block rounded-xl px-3 py-2.5 hover:bg-white"
            >
              <p className="truncate text-sm font-medium text-slate-800">
                {process.title}
              </p>
              <p className="mt-0.5 flex justify-between text-[10px] text-slate-400">
                <span>{process.reference}</span>
                <span>{process.status.replaceAll("_", " ")}</span>
              </p>
            </Link>
          ))}
          {!processes.length && (
            <p className="px-3 py-4 text-xs leading-5 text-slate-400">
              Suas operações aparecerão aqui como conversas.
            </p>
          )}
        </nav>
        <div className="border-t border-slate-200 p-3">
          <details>
            <summary className="cursor-pointer list-none rounded-xl px-3 py-2 text-sm text-slate-600 hover:bg-white">
              Ferramentas e cadastros
            </summary>
            <div className="mt-1 grid gap-1 pl-2 text-sm">
              <Link
                href="/workspace/processes"
                className="rounded-lg px-3 py-2 hover:bg-white"
              >
                Todos os processos
              </Link>
              <Link
                href="/workspace/catalog"
                className="rounded-lg px-3 py-2 hover:bg-white"
              >
                Catálogo
              </Link>
              <Link
                href="/workspace/suppliers"
                className="rounded-lg px-3 py-2 hover:bg-white"
              >
                Fornecedores
              </Link>
              <Link
                href="/workspace/conformity"
                className="rounded-lg px-3 py-2 hover:bg-white"
              >
                Conformidade
              </Link>
              <Link
                href="/workspace/drawback"
                className="rounded-lg px-3 py-2 hover:bg-white"
              >
                Drawback
              </Link>
              {showLayoutAdmin && (
                <Link
                  href="/workspace/admin/layouts"
                  className="rounded-lg px-3 py-2 text-brand hover:bg-white"
                >
                  Admin · Layouts
                </Link>
              )}
            </div>
          </details>
          <div className="mt-2 flex items-center justify-between rounded-xl px-3 py-2 hover:bg-white">
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold">{userName}</p>
              <p className="truncate text-[10px] text-slate-400">{email}</p>
            </div>
            <form action={logout}>
              <button
                aria-label="Sair"
                className="px-2 text-slate-400 hover:text-slate-800"
              >
                ↗
              </button>
            </form>
          </div>
        </div>
      </aside>
      <main className="h-dvh min-w-0 overflow-y-auto">{children}</main>
    </div>
  );
}
