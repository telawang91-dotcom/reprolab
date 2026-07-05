"use client";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { AnchorChip } from "./AnchorChip";

const pattern = /(⟦(?:art|src)_[0-9a-fA-F]{4}⟧)/g;
const exactAnchor = /^⟦(?:art|src)_[0-9a-fA-F]{4}⟧$/;
export function AnchoredMarkdown({ text, onAnchor }: { text: string; onAnchor?: (anchor: string) => void }) {
  return <span className="leading-7">{text.split(pattern).filter(Boolean).map((segment, index) => exactAnchor.test(segment) ?
    <AnchorChip key={`${segment}-${index}`} anchor={segment} onClick={() => onAnchor?.(segment)}/> :
    <ReactMarkdown key={index} remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]} components={{
      p: ({ children }) => <span>{children}</span>,
      h1: ({ children }) => <span className="block text-2xl font-semibold">{children}</span>,
      h2: ({ children }) => <span className="block text-xl font-semibold">{children}</span>,
      h3: ({ children }) => <span className="block text-lg font-semibold">{children}</span>,
      ul: ({ children }) => <span className="block list-disc pl-5">{children}</span>,
      ol: ({ children }) => <span className="block list-decimal pl-5">{children}</span>,
      li: ({ children }) => <span className="block">{children}</span>,
      blockquote: ({ children }) => <span className="block border-l-2 pl-3 text-slate-600">{children}</span>,
      pre: ({ children }) => <span className="block overflow-x-auto rounded bg-slate-950 p-3 text-slate-50">{children}</span>,
    }}>{segment}</ReactMarkdown>)}</span>;
}
