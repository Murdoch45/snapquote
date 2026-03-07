"use client";

import { Toaster as SonnerToaster } from "sonner";

export function Toaster() {
  return (
    <SonnerToaster
      position="top-right"
      toastOptions={{
        style: {
          background: "white",
          color: "#111827",
          border: "1px solid #E5E7EB"
        }
      }}
    />
  );
}
