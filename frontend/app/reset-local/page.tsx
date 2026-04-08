"use client";

import { useEffect, useState } from "react";

const LOCAL_STORAGE_PREFIX = "geminilearn";
const INDEXED_DB_NAMES = [
  "geminilearn-uploaded-files",
  "geminilearn-excalidraw",
];

const deleteIndexedDb = (name: string) =>
  new Promise<void>((resolve) => {
    if (typeof window === "undefined" || !("indexedDB" in window)) {
      resolve();
      return;
    }

    try {
      const request = window.indexedDB.deleteDatabase(name);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
      request.onblocked = () => {
        window.setTimeout(resolve, 800);
      };
    } catch {
      resolve();
    }
  });

export default function ResetLocalPage() {
  const [status, setStatus] = useState("Clearing local Scholar sessions...");

  useEffect(() => {
    let isMounted = true;

    const run = async () => {
      try {
        if (typeof window !== "undefined") {
          for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
            const key = window.localStorage.key(index);
            if (key?.startsWith(LOCAL_STORAGE_PREFIX)) {
              window.localStorage.removeItem(key);
            }
          }

          for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
            const key = window.sessionStorage.key(index);
            if (key?.startsWith(LOCAL_STORAGE_PREFIX)) {
              window.sessionStorage.removeItem(key);
            }
          }
        }

        await Promise.all(INDEXED_DB_NAMES.map((name) => deleteIndexedDb(name)));

        if (isMounted) {
          setStatus("All local Scholar sessions cleared. Redirecting...");
        }

        window.setTimeout(() => {
          window.location.replace("/student");
        }, 250);
      } catch {
        if (isMounted) {
          setStatus("Tried to clear local Scholar sessions. Redirecting...");
        }

        window.setTimeout(() => {
          window.location.replace("/student");
        }, 250);
      }
    };

    void run();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6">
      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-6 py-5 text-sm text-slate-700 shadow-sm">
        {status}
      </div>
    </main>
  );
}
