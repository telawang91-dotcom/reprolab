import { DatabaseZap } from "lucide-react";

export function EmptyState({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="empty-interactive grid min-h-52 place-items-center rounded-appleLg border border-dashed bg-surface/50 p-8 text-center transition duration-200 hover:border-brand/25 hover:bg-surface">
      <div><span className="empty-interactive-icon mx-auto grid h-11 w-11 place-items-center rounded-appleSm bg-brand/[.08] text-brand transition duration-200"><DatabaseZap size={20} /></span><h3 className="mt-3 font-semibold">{title}</h3><p className="mt-1 max-w-sm text-sm leading-6 text-muted">{description}</p>{action && <div className="mt-4 flex justify-center">{action}</div>}</div>
    </div>
  );
}
