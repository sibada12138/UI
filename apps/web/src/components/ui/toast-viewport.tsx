"use client";

import { useEffect, useMemo, useState } from "react";
import type { ToastPayload, ToastType } from "@/lib/toast";

type ToastItem = {
  id: string;
  message: string;
  type: ToastType;
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
      const type = custom.detail?.type ?? "info";
      const id = `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
      setItems((prev) => [...prev.slice(-2), { id, message, type }]);
      window.setTimeout(() => {
        setItems((prev) => prev.filter((item) => item.id !== id));
      }, 3200);
    }
    window.addEventListener("app-toast", onToast as EventListener);
    return () => window.removeEventListener("app-toast", onToast as EventListener);
  }, []);

  const classMap = useMemo(
    () => ({
      info: "border-[var(--brand-green)] bg-white text-[var(--page-text)]",
      success: "border-[var(--brand-green-dark)] bg-[var(--brand-green-dark)] text-white",
      error: "border-[var(--danger)] bg-white text-[var(--danger)]",
    }),
    [],
  );

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[100] grid w-[min(92vw,360px)] gap-2">
      {items.map((item) => (
        <div
          key={item.id}
          className={`rounded-[12px] border px-3 py-2 text-sm shadow-[0_0_0.5px_rgba(0,0,0,0.14),0_1px_1px_rgba(0,0,0,0.24)] ${classMap[item.type]}`}
        >
          {item.message}
        </div>
      ))}
    </div>
  );
}
