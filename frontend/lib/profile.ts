export type LocalProfile = {
  name: string;
  role: string;
  institution: string;
  researchFocus: string;
};

export const defaultProfile: LocalProfile = {
  name: "研究者",
  role: "研究生",
  institution: "",
  researchFocus: "",
};

export function readProfile(): LocalProfile {
  if (typeof window === "undefined") return defaultProfile;
  try {
    const saved = JSON.parse(localStorage.getItem("reprolab-profile") || "null");
    return saved && typeof saved.name === "string" ? { ...defaultProfile, ...saved } : defaultProfile;
  } catch { return defaultProfile; }
}

export function profileInitials(name: string): string {
  const clean = name.trim();
  if (!clean || clean === defaultProfile.name) return "RL";
  return /^[\u4e00-\u9fff]/.test(clean) ? clean.slice(-2) : clean.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}
