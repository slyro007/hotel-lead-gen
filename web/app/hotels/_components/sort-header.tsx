"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function SortHeader({
  column,
  children,
  align = "left",
}: {
  column: string;
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const active = (params.get("sort") ?? "score") === column;
  const dir = params.get("dir") ?? "desc";

  function toggle() {
    const next = new URLSearchParams(params.toString());
    next.set("sort", column);
    next.set("dir", active && dir === "desc" ? "asc" : "desc");
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  return (
    <button
      onClick={toggle}
      className={`flex w-full items-center gap-1 text-[11px] font-medium uppercase tracking-wider ${
        align === "right" ? "justify-end" : ""
      } ${active ? "text-foreground" : "text-zinc-500 dark:text-zinc-400"}`}
    >
      {children}
      {active && <span aria-hidden>{dir === "desc" ? "↓" : "↑"}</span>}
    </button>
  );
}
