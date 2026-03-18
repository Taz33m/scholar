import type { GeminilearnSmokeBridge } from "@/lib/smoke-bridge";

declare global {
  interface Window {
    __geminilearnSmoke?: GeminilearnSmokeBridge;
  }
}

export {};
