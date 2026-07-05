import { DatabaseZap } from "lucide-react";
export function EmptyState({ title, description }: { title: string; description: string }) {
  return <div className="grid min-h-52 place-items-center rounded-xl border border-dashed bg-slate-50/50 p-8 text-center dark:border-slate-700 dark:bg-slate-900/30"><div><span className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-blue-50 text-brand dark:bg-blue-950"><DatabaseZap size={20}/></span><h3 className="mt-3 font-semibold">{title}</h3><p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p></div></div>;
}

