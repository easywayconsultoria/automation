import Link from "next/link";
export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-paper">
      <div className="text-center">
        <p className="text-sm font-semibold text-brand">404</p>
        <h1 className="mt-2 text-2xl font-semibold">Página não encontrada</h1>
        <Link href="/" className="mt-5 inline-block text-brand hover:underline">
          Voltar ao início
        </Link>
      </div>
    </main>
  );
}
