"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Button, type ButtonVariant } from "@/components/ui/button";
import { Modal } from "./modal";

/** 需要確認的危險操作（刪除、封存）。 */
export function ConfirmButton({
  label,
  title,
  description,
  confirmLabel,
  onConfirm,
  variant = "text",
  confirmVariant = "danger",
  icon,
  size = "sm",
}: {
  label: string;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  onConfirm: () => Promise<boolean>;
  variant?: ButtonVariant;
  confirmVariant?: ButtonVariant;
  icon?: ReactNode;
  size?: "sm" | "md";
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)}>
        {icon}
        {label}
      </Button>
      <Modal open={open} title={title} onClose={() => setOpen(false)}>
        <div className="type-body text-on-surface-variant">{description}</div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="text" onClick={() => setOpen(false)} disabled={pending}>
            取消
          </Button>
          <Button
            variant={confirmVariant}
            disabled={pending}
            onClick={() =>
              start(async () => {
                const done = await onConfirm();
                if (done) setOpen(false);
              })
            }
          >
            {pending ? "處理中…" : confirmLabel}
          </Button>
        </div>
      </Modal>
    </>
  );
}
