"use client";

export function Switch({
  checked,
  onCheckedChange,
  label,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onCheckedChange(!checked)}
      className="group relative h-11 w-12 rounded-full"
    >
      <span className={`absolute inset-x-0 top-2 h-7 rounded-full transition duration-200 group-hover:ring-2 group-hover:ring-brand/20 ${checked ? "bg-brand" : "bg-ink/20"}`} />
      <span
        className={`absolute top-3 h-5 w-5 rounded-full bg-white transition-transform duration-200 group-hover:scale-105 ${checked ? "translate-x-6" : "translate-x-1"}`}
      />
    </button>
  );
}
