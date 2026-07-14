import type { ReactNode } from "react";

export function AuthShell({
  title,
  subtitle,
  children
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-paper px-5 py-10">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-8">
          <p className="mb-3 text-sm font-bold uppercase tracking-[0.2em] text-brand">
            EasyWay AI
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-ink">
            {title}
          </h1>
          <p className="mt-2 text-slate-600">{subtitle}</p>
        </div>
        {children}
      </section>
    </main>
  );
}
