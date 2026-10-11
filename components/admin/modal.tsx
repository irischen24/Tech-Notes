"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

/** 以原生 <dialog> 實作：具備焦點鎖定、Esc 關閉與 ::backdrop。 */
export function Modal({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="modal-title"
      className="m-auto w-[min(100%-2rem,36rem)] rounded-[28px] bg-surface-container-high p-0 text-on-surface shadow-(--shadow-elevation-2) backdrop:bg-black/40"
    >
      <div className="flex items-center justify-between gap-4 px-6 pt-6">
        <h2 id="modal-title" className="type-title">
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex size-10 items-center justify-center rounded-full text-on-surface-variant hover:bg-on-surface/8"
          aria-label="關閉"
        >
          <X className="size-5" aria-hidden />
        </button>
      </div>
      <div className="max-h-[75vh] overflow-y-auto px-6 pt-4 pb-6">{open ? children : null}</div>
    </dialog>
  );
}
