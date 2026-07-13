import { BookOpen, Brain, CircleHelp, FlaskConical, FolderKanban, LayoutDashboard, Network, PackageCheck, Settings, ShieldCheck, UserRound, Workflow } from "lucide-react";

export const primaryNavigation = [
  { href: "/", label: "工作台", detail: "任务入口与研究进度", icon: LayoutDashboard },
  { href: "/knowledge", label: "资料", detail: "上传、检索与阅读", icon: BookOpen },
  { href: "/analysis", label: "分析", detail: "描述问题并运行 Agent", icon: FlaskConical },
  { href: "/results", label: "成果", detail: "产物、写作、溯源与记录", icon: PackageCheck },
];

export const commandNavigation = [
  ...primaryNavigation,
  { href: "/projects", label: "项目", detail: "切换、归档与研究概览", icon: FolderKanban },
  { href: "/results?tab=writing", label: "写作", detail: "整理报告与结论", icon: Workflow },
  { href: "/results?tab=lineage", label: "溯源总览", detail: "查看可信链路入口", icon: Network },
  { href: "/results?tab=records", label: "时间线与审阅", detail: "回看项目进展和风险", icon: ShieldCheck },
  { href: "/memory", label: "科研记忆", detail: "管理偏好与方法", icon: Brain },
  { href: "/guide", label: "产品指南", detail: "第一次使用从这里开始", icon: CircleHelp },
  { href: "/settings", label: "设置", detail: "模型与运行状态", icon: Settings },
  { href: "/profile", label: "个人资料", detail: "称呼、身份与研究方向", icon: UserRound },
];
