"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";

export function Sheet({
  open,
  onOpenChange,
  title,
  children,
  side = "right",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
  side?: "right" | "bottom";
}) {
  const reduceMotion = useReducedMotion();
  const initial = reduceMotion ? false : side === "right" ? { x: 36, opacity: 0 } : { y: 36, opacity: 0 };
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] bg-black/30"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={() => onOpenChange(false)}
        >
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={initial}
            animate={{ x: 0, y: 0, opacity: 1 }}
            exit={initial || { opacity: 0 }}
            transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 400, damping: 34 }}
            onMouseDown={(event) => event.stopPropagation()}
            className={`popover absolute overflow-y-auto border p-5 ${
              side === "right"
                ? "bottom-0 right-0 top-0 w-full max-w-md border-l"
                : "inset-x-0 bottom-0 max-h-[88vh] rounded-t-appleXl border-t"
            }`}
          >
            <div className="mb-5 flex items-center gap-3">
              <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
              <button className="btn-secondary ml-auto h-11 w-11 px-0" onClick={() => onOpenChange(false)} aria-label={`关闭${title}`}>
                <X size={15} />
              </button>
            </div>
            {children}
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
