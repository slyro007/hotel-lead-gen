"use client";

import { useState } from "react";

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          /* clipboard blocked — no-op */
        }
      }}
      className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[13px] text-ink-muted transition-colors hover:text-foreground"
    >
      {done ? "Copied ✓" : label}
    </button>
  );
}
