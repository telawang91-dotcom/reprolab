"use client";

import { AlertTriangle, Loader2 } from "lucide-react";
import { Sheet } from "./Sheet";

export function ConfirmDialog({ open, title, description, confirmLabel = "确认删除", busy = false, error, onCancel, onConfirm }: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  busy?: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  return <Sheet open={open} onOpenChange={(next) => { if (!next && !busy) onCancel(); }} title={title} side="bottom">
    <div className="mx-auto max-w-xl">
      <span className="grid h-11 w-11 place-items-center rounded-full bg-status-err/10 text-status-err"><AlertTriangle size={19}/></span>
      <p className="mt-4 text-sm leading-7 text-muted">{description}</p>
      {error && <div role="alert" className="status-error mt-4">{error}</div>}
      <div className="mt-6 flex justify-end gap-2"><button disabled={busy} onClick={onCancel} className="btn-secondary">取消</button><button disabled={busy} onClick={() => void onConfirm()} className="btn bg-status-err text-white hover:bg-status-err/90">{busy && <Loader2 size={14} className="animate-spin"/>}{busy ? "处理中…" : confirmLabel}</button></div>
    </div>
  </Sheet>;
}
