"use client";

import { Check, FlaskConical, RotateCcw, Save, ShieldCheck, UserRound } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

import { defaultProfile, profileInitials, readProfile, type LocalProfile } from "@/lib/profile";

export default function ProfilePage() {
  const [profile, setProfile] = useState<LocalProfile>(defaultProfile);
  const [saved, setSaved] = useState(false);
  useEffect(() => setProfile(readProfile()), []);

  function submit(event: FormEvent) {
    event.preventDefault();
    const next = { ...profile, name: profile.name.trim() || defaultProfile.name };
    localStorage.setItem("reprolab-profile", JSON.stringify(next));
    setProfile(next); setSaved(true);
    window.dispatchEvent(new CustomEvent("reprolab-profile-updated", { detail: next }));
    window.setTimeout(() => setSaved(false), 2200);
  }

  function reset() {
    setProfile(defaultProfile);
    localStorage.removeItem("reprolab-profile");
    window.dispatchEvent(new CustomEvent("reprolab-profile-updated", { detail: defaultProfile }));
  }

  return <div className="mx-auto max-w-5xl space-y-6 p-5 lg:p-8">
    <header><div className="label">账户与偏好</div><h1 className="mt-1 text-2xl font-semibold">个人资料</h1><p className="mt-2 text-sm text-slate-500">用于显示称呼和研究背景，帮助工作区提供更贴近你的默认体验。</p></header>

    <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
      <aside className="card h-fit p-6 text-center"><div className="mx-auto grid h-20 w-20 place-items-center rounded-2xl bg-slate-900 text-xl font-semibold text-white dark:bg-slate-100 dark:text-slate-900">{profileInitials(profile.name)}</div><h2 className="mt-4 text-lg font-semibold">{profile.name || "研究者"}</h2><p className="mt-1 text-sm text-slate-500">{profile.role || "未填写身份"}</p>{profile.institution && <p className="mt-1 text-xs text-slate-400">{profile.institution}</p>}<div className="mt-5 rounded-xl bg-slate-50 p-3 text-left text-xs leading-5 text-slate-500 dark:bg-slate-900"><div className="mb-1 flex items-center gap-2 font-medium text-slate-700 dark:text-slate-200"><ShieldCheck size={14}/>本地工作区资料</div>当前版本不会公开展示这些信息，也不会用于训练模型。</div></aside>

      <form onSubmit={submit} className="card overflow-hidden"><div className="flex items-start gap-3 border-b p-5"><span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-brand dark:bg-blue-950"><UserRound size={18}/></span><div><h2 className="font-semibold">基本信息</h2><p className="mt-1 text-sm text-slate-500">这些信息只保存在当前浏览器。</p></div></div><div className="space-y-5 p-5">
        <div className="grid gap-4 sm:grid-cols-2"><label><span className="text-sm font-medium">怎么称呼你</span><input value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} className="input mt-2 w-full" placeholder="姓名或昵称" maxLength={40}/></label><label><span className="text-sm font-medium">当前身份</span><select value={profile.role} onChange={(event) => setProfile({ ...profile, role: event.target.value })} className="input mt-2 w-full"><option>本科生</option><option>研究生</option><option>博士生</option><option>博士后</option><option>教师 / PI</option><option>科研人员</option><option>其他</option></select></label></div>
        <label className="block"><span className="text-sm font-medium">学校或机构</span><input value={profile.institution} onChange={(event) => setProfile({ ...profile, institution: event.target.value })} className="input mt-2 w-full" placeholder="选填，例如：某某大学" maxLength={100}/></label>
        <label className="block"><span className="text-sm font-medium">研究方向</span><textarea value={profile.researchFocus} onChange={(event) => setProfile({ ...profile, researchFocus: event.target.value })} className="input mt-2 min-h-28 w-full resize-y py-3" placeholder="选填，例如：新能源材料、计算社会科学、蛋白质组学…" maxLength={300}/><span className="mt-1.5 block text-xs text-slate-400">后续可用于推荐更合适的分析表达和资料组织方式。</span></label>
        <div className="flex flex-wrap justify-end gap-2 border-t pt-5"><button type="button" onClick={reset} className="btn-secondary"><RotateCcw size={15}/>恢复默认</button><button type="submit" className="btn-primary">{saved ? <Check size={15}/> : <Save size={15}/>} {saved ? "已保存" : "保存资料"}</button></div>
      </div></form>
    </div>

    <section className="rounded-xl border border-blue-200 bg-blue-50 p-5 text-sm leading-6 text-blue-950"><div className="flex items-center gap-2 font-medium"><FlaskConical size={16}/>关于个性化</div><p className="mt-2">研究方向不会限制可用功能。ReproLab 的分析机制始终保持学科无关，这些资料只用于改善称呼、默认提示和建议排序。</p></section>
  </div>;
}
