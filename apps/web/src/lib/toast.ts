export type ToastType = "info" | "success" | "error";

export type ToastTypeEx = ToastType | "warning";

export type ToastPayload = {
  title?: string;
  message: string;
  type?: ToastTypeEx;
  durationMs?: number;
};

export function pushToast(payload: ToastPayload) {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new CustomEvent("app-toast", { detail: payload }));
}
