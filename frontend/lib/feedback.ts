"use client";

export type FeedbackTone = "success" | "warning" | "error" | "info";
export type FeedbackAction = { label: string; run: () => void | Promise<void> };
export type FeedbackItem = {
  id: string;
  message: string;
  tone: FeedbackTone;
  action?: FeedbackAction;
};

export function notifyFeedback(message: string, tone: FeedbackTone = "success", action?: FeedbackAction) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<FeedbackItem>("reprolab-feedback", {
    detail: { id: crypto.randomUUID(), message, tone, action },
  }));
}
