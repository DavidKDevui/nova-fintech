"use client";

import { Toaster } from "sonner";
import { ToastHandler } from "@/components/toast-handler";

export function ToastProvider() {
  return (
    <>
      <ToastHandler />
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            borderRadius: "0",
            fontFamily: "var(--font-sora), system-ui, sans-serif",
            letterSpacing: "-0.02em",
          },
        }}
      />
    </>
  );
}
