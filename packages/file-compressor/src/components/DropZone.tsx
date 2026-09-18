"use client";

import { useCallback, useRef, useState } from "react";

export function DropZone({ onFile, busy }: { onFile: (file: File) => void; busy: boolean }) {
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const take = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (file) onFile(file);
    },
    [onFile],
  );

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        take(event.dataTransfer.files);
      }}
      className={`rounded-2xl border-2 border-dashed p-12 text-center transition-colors ${
        dragging ? "border-accent bg-surface-2" : "border-line bg-surface"
      }`}
    >
      <input
        ref={input}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(event) => take(event.target.files)}
      />
      <p className="text-lg font-medium text-ink">Drop a PDF here</p>
      <p className="mt-2 text-sm text-ink-2">
        It is read in this browser tab and never uploaded. Nothing leaves your machine.
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={() => input.current?.click()}
        className="mt-5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-ink disabled:opacity-40"
      >
        Choose a file
      </button>
    </div>
  );
}
