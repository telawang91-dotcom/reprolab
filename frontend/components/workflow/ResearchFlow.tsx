import {
  BookOpen,
  Check,
  FileCheck2,
  FlaskConical,
  PackageCheck,
} from "lucide-react";
import Link from "next/link";

const steps = [
  { href: "/knowledge", label: "添加资料", icon: BookOpen },
  { href: "/analysis", label: "运行分析", icon: FlaskConical },
  { href: "/results", label: "检查成果", icon: PackageCheck },
  { href: "/writing", label: "形成报告", icon: FileCheck2 },
];

export function ResearchFlow({ stage = 0 }: { stage?: number }) {
  return (
    <nav aria-label="研究流程" className="flow-strip">
      {steps.map(({ href, label, icon: Icon }, index) => {
        const complete = index < stage;
        const current = index === stage;
        return (
          <Link
            key={href}
            href={href}
            className={`flow-step ${current ? "flow-step-current" : ""}`}
          >
            <span
              className={`flow-dot ${complete ? "flow-dot-complete" : current ? "flow-dot-current" : ""}`}
            >
              {complete ? <Check size={13} /> : <Icon size={13} />}
            </span>
            <span>{label}</span>
            {index < steps.length - 1 && (
              <span aria-hidden className="flow-line" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
