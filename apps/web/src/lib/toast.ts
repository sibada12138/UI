export type ToastType = "info" | "success" | "error";

export type ToastPayload = {
  message: string;
  type?: ToastType;
};

export function pushToast(payload: ToastPayload) {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new CustomEvent("app-toast", { detail: payload }));
}
