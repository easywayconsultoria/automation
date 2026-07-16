"use client";

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { sendConversationWithAttachments } from "@/app/actions/conversation";

const accept = ".pdf,.csv,.xlsx,.xml,.jpg,.jpeg,.png";
const maxFiles = 5;

export function AttachmentComposer({ processId }: { processId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function applyFiles(next: File[]) {
    const unique = next
      .filter(
        (file, index, all) =>
          all.findIndex(
            (item) => item.name === file.name && item.size === file.size
          ) === index
      )
      .slice(0, maxFiles);
    if (next.length > maxFiles)
      setError("Envie no máximo 5 arquivos por mensagem.");
    else setError(null);
    setFiles(unique);
    const transfer = new DataTransfer();
    unique.forEach((file) => transfer.items.add(file));
    if (inputRef.current) inputRef.current.files = transfer.files;
  }

  return (
    <form
      action={sendConversationWithAttachments}
      className="mx-auto max-w-3xl"
    >
      <input type="hidden" name="processId" value={processId} />
      {files.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {files.map((file, index) => (
            <span
              key={`${file.name}-${file.size}`}
              className="flex max-w-full items-center gap-2 rounded-xl border bg-white px-3 py-2 text-xs shadow-sm"
            >
              <span className="truncate">{file.name}</span>
              <span className="shrink-0 text-[10px] text-slate-400">
                {formatBytes(file.size)}
              </span>
              <button
                type="button"
                aria-label={`Remover ${file.name}`}
                onClick={() =>
                  applyFiles(
                    files.filter((_, itemIndex) => itemIndex !== index)
                  )
                }
                className="shrink-0 text-slate-400 hover:text-red-600"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
      <div
        onDragEnter={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node))
            setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          applyFiles([...files, ...Array.from(event.dataTransfer.files)]);
        }}
        className={`flex items-end gap-2 rounded-[26px] border bg-white p-3 shadow-[0_10px_35px_rgba(15,23,42,0.12)] transition ${dragging ? "border-brand ring-2 ring-emerald-100" : "border-slate-200"}`}
      >
        <input
          ref={inputRef}
          type="file"
          name="files"
          multiple
          accept={accept}
          className="sr-only"
          onChange={(event) =>
            applyFiles([...files, ...Array.from(event.target.files ?? [])])
          }
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          aria-label="Anexar arquivos"
          title="Anexar PDF, CSV, XLSX, XML ou imagem"
          className="flex h-10 shrink-0 items-center gap-2 rounded-full border border-slate-300 bg-slate-50 px-3 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-brand hover:bg-emerald-50 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-4"
          >
            <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
          <span>Anexar</span>
        </button>
        <textarea
          name="content"
          rows={2}
          placeholder={
            dragging
              ? "Solte os arquivos aqui…"
              : "Pergunte ou envie documentos para esta operação…"
          }
          className="min-h-14 flex-1 resize-none border-0 px-2 py-2 text-sm outline-none"
        />
        <SubmitButton disabled={Boolean(error)} />
      </div>
      <p className="mt-2 text-center text-[10px] text-slate-400">
        Até 5 arquivos · 10 MB cada · PDF, CSV, XLSX, XML, JPG ou PNG
      </p>
    </form>
  );
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={disabled || pending}
      className="grid size-10 shrink-0 place-items-center rounded-full bg-ink text-white disabled:cursor-not-allowed disabled:opacity-40"
      aria-label={pending ? "Enviando" : "Enviar"}
    >
      {pending ? <span className="animate-pulse text-xs">•••</span> : "↑"}
    </button>
  );
}

function formatBytes(bytes: number) {
  return bytes < 1_000_000
    ? `${Math.ceil(bytes / 1_000)} KB`
    : `${(bytes / 1_000_000).toFixed(1)} MB`;
}
