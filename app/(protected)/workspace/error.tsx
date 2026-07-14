"use client";
export default function ErrorPage({
  reset
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-paper px-5">
      <div className="max-w-md rounded-xl bg-white p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold">
          Não foi possível carregar o workspace
        </h1>
        <p className="mt-2 text-slate-600">
          Tente novamente. Se o erro persistir, verifique a conexão com o banco.
        </p>
        <button
          onClick={reset}
          className="mt-5 rounded-lg bg-brand px-4 py-2 text-white"
        >
          Tentar novamente
        </button>
      </div>
    </main>
  );
}
