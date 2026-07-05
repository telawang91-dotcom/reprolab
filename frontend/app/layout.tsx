import "./globals.css";
import "katex/dist/katex.min.css";
import type { Metadata } from "next";
import { AppShell } from "@/components/shell/AppShell";

export const metadata: Metadata = {
  title: "ReproLab",
  description: "可信可复现的科研工作台"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body><AppShell>{children}</AppShell></body>
    </html>
  );
}

