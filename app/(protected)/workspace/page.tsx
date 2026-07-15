import { startImportConversation } from "@/app/actions/domain";
import { requireWorkspace } from "@/lib/auth/context";

const prompts = [
  "Quero iniciar um novo despacho de importação",
  "Preciso conferir uma invoice e classificar os itens",
  "Quero revisar cobertura e saldos de drawback",
  "Analise os documentos e monte um plano de ação"
];

export default async function WorkspacePage({
  searchParams
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const { user } = await requireWorkspace();
  const { message } = await searchParams;
  const firstName = String(
    user.user_metadata.full_name ?? user.email ?? ""
  ).split(/[ @]/)[0];
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-14 items-center justify-between px-5 md:hidden">
        <b>EasyWay AI</b>
        <span className="text-xs text-slate-400">Nova conversa</span>
      </header>
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-5 pb-8 pt-16">
        <div className="mx-auto mb-8 grid size-14 place-items-center rounded-2xl bg-ink text-2xl font-black text-emerald-300">
          E
        </div>
        <h1 className="text-center text-3xl font-semibold tracking-tight text-slate-900">
          Como posso conduzir sua operação hoje
          {firstName ? `, ${firstName}` : ""}?
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-center text-sm leading-6 text-slate-500">
          Abra um processo conversando. Depois anexe invoice, CSVs ou documentos
          e use as ferramentas determinísticas dentro da própria conversa.
        </p>
        {message && (
          <p className="mx-auto mt-4 rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-900">
            {message}
          </p>
        )}
        <form
          action={startImportConversation}
          className="mt-10 rounded-[26px] border border-slate-200 bg-white p-3 shadow-[0_12px_40px_rgba(15,23,42,0.10)] focus-within:border-slate-400"
        >
          <textarea
            name="content"
            required
            rows={3}
            autoFocus
            placeholder="Descreva o despacho, cliente, origem ou o que você precisa analisar…"
            className="w-full resize-none border-0 bg-transparent px-3 py-2 text-base outline-none placeholder:text-slate-400"
          />
          <div className="flex items-center justify-between px-2 pb-1">
            <span className="text-xs text-slate-400">
              Nova conversa = novo processo
            </span>
            <button className="grid size-10 place-items-center rounded-full bg-ink text-lg text-white">
              ↑
            </button>
          </div>
        </form>
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          {prompts.map((prompt) => (
            <form action={startImportConversation} key={prompt}>
              <input type="hidden" name="content" value={prompt} />
              <button className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-left text-sm text-slate-600 hover:bg-slate-50">
                {prompt}
              </button>
            </form>
          ))}
        </div>
      </div>
      <p className="pb-4 text-center text-[11px] text-slate-400">
        EasyWay AI usa ferramentas auditáveis e preserva decisões humanas.
      </p>
    </div>
  );
}
