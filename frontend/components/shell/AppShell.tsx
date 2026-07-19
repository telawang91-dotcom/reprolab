"use client";

import { Suspense } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { WorkspaceGate } from "./WorkspaceGate";
import { WorkspaceScopeProvider } from "@/components/workspace/WorkspaceScope";
import { DocumentManager } from "@/components/workspace/DocumentManager";
import { ProjectScopeProvider } from "@/components/workspace/ProjectScope";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <ProjectScopeProvider>
      <WorkspaceScopeProvider>
        <div className="min-h-screen bg-canvas">
          <Topbar />
          <aside className="material fixed bottom-0 left-0 top-14 z-30 hidden w-[248px] border-r p-3 md:block"><Suspense fallback={<div className="h-40 animate-pulse rounded-apple bg-ink/[.05]" />}><Sidebar /></Suspense></aside>
          <main className="min-h-screen pt-14 md:pl-[248px]"><WorkspaceGate>{children}</WorkspaceGate></main>
          <DocumentManager />
        </div>
      </WorkspaceScopeProvider>
    </ProjectScopeProvider>
  );
}
