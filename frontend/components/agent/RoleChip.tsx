import { Compass, Search, Settings2 } from "lucide-react";

const roles = {
  plan: { label: "规划", icon: Compass, className: "bg-role-plan/10 text-role-plan" },
  execute: { label: "执行", icon: Settings2, className: "bg-role-execute/10 text-role-execute" },
  review: { label: "审阅", icon: Search, className: "bg-role-review/10 text-role-review" },
};
export function RoleChip({ role }: { role: keyof typeof roles }) {
  const item = roles[role]; const Icon = item.icon;
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${item.className}`}><Icon size={12} />{item.label}</span>;
}
