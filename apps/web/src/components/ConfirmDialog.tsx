import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body?: string;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Modal confirmation for destructive actions, built on the native <dialog> element. */
export function ConfirmDialog({ open, title, body, confirmLabel, busy, onConfirm, onCancel }: ConfirmDialogProps) {
  const { t } = useTranslation();
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
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
      aria-labelledby="confirm-title"
      className="m-auto w-[min(calc(100%-2rem),24rem)] rounded-2xl bg-panel p-6 text-ink shadow-stage"
    >
      <h2 id="confirm-title" className="text-lg font-extrabold">
        {title}
      </h2>
      {body && <p className="mt-2 text-sm text-muted">{body}</p>}
      <div className="mt-6 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="min-h-11 rounded-xl border border-line bg-white px-4 font-bold text-ink hover:bg-sage disabled:opacity-60"
        >
          {t('common.cancel')}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="min-h-11 rounded-xl bg-clay-ink px-4 font-bold text-white hover:bg-[#843a2c] disabled:opacity-60"
        >
          {busy ? t('common.deleting') : confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
