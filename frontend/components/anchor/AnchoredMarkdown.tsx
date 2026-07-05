"use client";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { AnchorChip } from "./AnchorChip";

const pattern = /(⟦(?:art|src)_[0-9a-fA-F]{4}⟧)/g;
const exactAnchor = /^⟦(?:art|src)_[0-9a-fA-F]{4}⟧$/;
export function AnchoredMarkdown({ text, onAnchor }: { text: string; onAnchor?: (anchor: string) => void }) {
  return <div className="leading-7">{text.split(pattern).filter(Boolean).map((segment, index) => exactAnchor.test(segment) ?
    <AnchorChip key={`${segment}-${index}`} anchor={segment} onClick={() => onAnchor?.(segment)}/> :
    <ReactMarkdown key={index} remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]} components={{ p: ({ children }) => <span>{children}</span> }}>{segment}</ReactMarkdown>)}</div>;
}
