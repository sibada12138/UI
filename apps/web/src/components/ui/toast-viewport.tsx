"use client";

import { useEffect, useState } from "react";
import type { ToastPayload, ToastTypeEx } from "@/lib/toast";

type ToastItem = {
  id: string;
  title: string;
  message: string;
  type: ToastTypeEx;
  durationMs: number;
};

const TYPE_META: Record<
  ToastTypeEx,
  {
    line: string;
    icon: string;
    iconColor: string;
  }
> = {
  success: {
    line: "#006241",
    icon: "★",
    iconColor: "#006241",
  },
  warning: {
    line: "#cba258",
    icon: "▲",
    iconColor: "#cba258",
  },
  error: {
    line: "#d13239",
    icon: "■",
    iconColor: "#d13239",
  },
  info: {
    line: "#2b5148",
    icon: "●",
    iconColor: "#2b5148",
  },
};

export default function ToastViewport() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    function onToast(event: Event) {
      const custom = event as CustomEvent<ToastPayload>;
      const message = String(custom.detail?.message ?? "").trim();
      if (!message) {
        return;
      }
      const type = (custom.detail?.type ?? "info") as ToastTypeEx;
      const title = String(
        custom.detail?.title ??
          (type === "success" ? "操作成功" : type === "error" ? "操作失败" : type === "warning" ? "注意" : "提示"),
      ).trim();
      const durationMs = Math.max(1800, Number(custom.detail?.durationMs ?? 4000));
      const id = `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
      setItems((prev) => [...prev.slice(-4), { id, title, message, type, durationMs }]);
      window.setTimeout(() => {
        setItems((prev) => prev.filter((item) => item.id !== id));
      }, durationMs);
    }
    window.addEventListener("app-toast", onToast as EventListener);
    return () => window.removeEventListener("app-toast", onToast as EventListener);
  }, []);

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[120] flex w-[min(94vw,390px)] flex-col gap-3 md:right-6 md:top-6">
      {items.map((item) => {
        const meta = TYPE_META[item.type];
        return (
          <div
            key={item.id}
            className="pointer-events-auto rounded-[12px] border border-white/40 bg-[rgba(255,255,255,0.88)] px-4 py-3 shadow-[0_8px_24px_rgba(0,32,22,0.08)] backdrop-blur-[16px]"
            style={{ borderLeft: `4px solid ${meta.line}` }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-1 gap-2">
                <span className="mt-[1px] text-base" style={{ color: meta.iconColor }}>
                  {meta.icon}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[#1E3932]">{item.title}</p>
                  <p className="mt-0.5 break-words text-xs leading-5 text-[rgba(30,57,50,0.74)]">{item.message}</p>
                </div>
              </div>
              <button
                type="button"
                className="rounded-full border border-transparent px-1 text-base leading-none text-[rgba(30,57,50,0.45)] hover:border-[var(--card-border)] hover:text-[#1E3932]"
                onClick={() => setItems((prev) => prev.filter((entry) => entry.id !== item.id))}
                aria-label="关闭通知"
              >
                ×
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
